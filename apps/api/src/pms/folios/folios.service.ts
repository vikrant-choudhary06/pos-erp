import { BadRequestException, Injectable } from '@nestjs/common';
import { addHotelDays, hotelDateKey, hotelNights, hotelToday, toPaise } from '@pos/shared';
import { HotelReservation, Prisma } from '@prisma/client';
import { AuthUser } from '../../auth/decorators';
import { requirePermission } from '../../common/permissions';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CloseDayDto, FolioEntryDto } from '../dto';
import { HotelDb, parseHotelDate, PmsAccessService } from '../pms-access.service';

@Injectable()
export class HotelFoliosService {
  constructor(
    private prisma: PrismaService,
    private access: PmsAccessService,
    private audit: AuditService,
  ) {}

  async get(user: AuthUser, propertyId: string, id: string, db: HotelDb = this.prisma) {
    const stay = await this.access.reservation(user, propertyId, id, db);
    const balance = stay.entries.reduce((sum, entry) => sum + toPaise(entry.amount.toString()), 0);
    const roomTotal = hotelNights(stay.arrival, stay.departure) * this.nightlyTotal(stay);
    const postedRoomTotal = stay.entries
      .filter((entry) => entry.kind === 'ROOM')
      .reduce((sum, entry) => sum + toPaise(entry.amount.toString()), 0);
    const property = await this.access.property(user, propertyId, db);
    const checkoutDate =
      property.businessDate > stay.arrival ? property.businessDate : addHotelDays(stay.arrival, 1);
    const checkoutNights = hotelNights(
      stay.arrival,
      checkoutDate < stay.departure ? checkoutDate : stay.departure,
    );
    return {
      ...stay,
      balance: balance / 100,
      checkoutBalance: (balance + checkoutNights * this.nightlyTotal(stay) - postedRoomTotal) / 100,
      estimatedBalance:
        (balance +
          (['CANCELLED', 'NO_SHOW'].includes(stay.status) ? 0 : roomTotal - postedRoomTotal)) /
        100,
    };
  }

  private nightlyTotal(stay: HotelReservation) {
    const net = toPaise(stay.nightlyRate.toString());
    return net + Math.round((net * Number(stay.taxPercent)) / 100);
  }

  async postNights(db: HotelDb, stay: HotelReservation, until: Date, user: AuthUser) {
    const existing = await db.hotelFolioEntry.findMany({
      where: { reservationId: stay.id, kind: 'ROOM' },
      select: { sourceKey: true },
    });
    const posted = new Set(existing.map((entry) => entry.sourceKey));
    const entries: Prisma.HotelFolioEntryCreateManyInput[] = [];
    for (
      let date = stay.arrival;
      date < until && date < stay.departure;
      date = addHotelDays(date, 1)
    ) {
      const sourceKey = `night:${hotelDateKey(date)}`;
      if (posted.has(sourceKey)) continue;
      const amount = this.nightlyTotal(stay);
      const taxAmount = amount - toPaise(stay.nightlyRate.toString());
      entries.push({
        reservationId: stay.id,
        kind: 'ROOM',
        description: `Room night · ${hotelDateKey(date)}`,
        amount: amount / 100,
        taxAmount: taxAmount / 100,
        businessDate: date,
        sourceKey,
        createdById: user.userId,
      });
    }
    if (entries.length)
      await db.hotelFolioEntry.createMany({ data: entries, skipDuplicates: true });
  }

  async add(user: AuthUser, propertyId: string, reservationId: string, dto: FolioEntryDto) {
    if (dto.kind === 'CREDIT' || dto.kind === 'REFUND') requirePermission(user, 'hotel.manage');
    const monetary = dto.kind === 'PAYMENT' || dto.kind === 'REFUND';
    if (monetary && (!dto.method || dto.method === 'CREDIT'))
      throw new BadRequestException(
        'Choose a collected payment method; customer credit is not a payment',
      );
    if (!monetary && dto.method)
      throw new BadRequestException('Charges and credits have no payment method');
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const stay = await this.get(user, propertyId, reservationId, tx);
      const amount =
        (dto.kind === 'PAYMENT' || dto.kind === 'CREDIT' ? -1 : 1) * toPaise(dto.amount);
      const existing = await tx.hotelFolioEntry.findUnique({ where: { id: dto.id } });
      if (existing) {
        if (
          existing.reservationId !== reservationId ||
          existing.kind !== dto.kind ||
          toPaise(existing.amount.toString()) !== amount ||
          existing.description !== dto.description ||
          existing.method !== (dto.method ?? null) ||
          existing.reference !== (dto.reference ?? null)
        )
          throw new BadRequestException('This transaction ID belongs to a different entry');
        return stay;
      }
      if (
        ['CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].includes(stay.status) &&
        !['REFUND', 'CREDIT'].includes(dto.kind)
      )
        throw new BadRequestException('This guest account is closed');
      if (dto.kind === 'PAYMENT' && dto.amount > stay.estimatedBalance)
        throw new BadRequestException('Payment exceeds the estimated amount due');
      if (dto.kind === 'CREDIT' && dto.amount > Math.max(0, stay.estimatedBalance))
        throw new BadRequestException('Credit exceeds the guest account charges');
      if (dto.kind === 'REFUND') {
        const available = -stay.entries
          .filter((entry) => ['PAYMENT', 'REFUND'].includes(entry.kind))
          .reduce((sum, entry) => sum + toPaise(entry.amount.toString()), 0);
        if (toPaise(dto.amount) > available)
          throw new BadRequestException('Refund exceeds recorded payments');
      }
      await tx.hotelFolioEntry.create({
        data: {
          id: dto.id,
          reservationId,
          kind: dto.kind,
          description: dto.description,
          amount: amount / 100,
          businessDate: property.businessDate,
          sourceKey: `manual:${dto.id}`,
          method: dto.method,
          reference: dto.reference,
          createdById: user.userId,
        },
      });
      await this.audit.log(
        user,
        {
          action: `hotel.folio.${dto.kind.toLowerCase()}`,
          entityType: 'HotelReservation',
          entityId: reservationId,
          outletId: property.outletId,
          after: dto,
        },
        tx,
      );
      return this.get(user, propertyId, reservationId, tx);
    });
  }

  async closeDay(user: AuthUser, propertyId: string, dto: CloseDayDto) {
    const date = parseHotelDate(dto.date);
    return this.prisma.$transaction(
      async (tx) => {
        const property = await this.access.lock(user, propertyId, tx);
        const existing = await tx.hotelDayClosing.findUnique({
          where: { propertyId_businessDate: { propertyId, businessDate: date } },
        });
        if (existing) return existing;
        if (hotelDateKey(property.businessDate) !== dto.date)
          throw new BadRequestException('Close the current hotel business day first');
        if (dto.date >= hotelToday(property.outlet.timezone))
          throw new BadRequestException('The business day must finish before it can be closed');
        if (
          await tx.hotelReservation.count({
            where: { propertyId, status: 'RESERVED', arrival: { lte: date } },
          })
        )
          throw new BadRequestException('Resolve arrivals first: check in, cancel or mark no-show');
        if (
          await tx.hotelReservation.count({
            where: { propertyId, status: 'CHECKED_IN', departure: { lte: date } },
          })
        )
          throw new BadRequestException('Resolve overdue departures before closing the day');
        const stays = await tx.hotelReservation.findMany({
          where: {
            propertyId,
            status: 'CHECKED_IN',
            arrival: { lte: date },
            departure: { gt: date },
          },
        });
        for (const stay of stays) await this.postNights(tx, stay, addHotelDays(date, 1), user);
        const total = await tx.hotelFolioEntry.aggregate({
          where: { reservation: { propertyId }, kind: 'ROOM', businessDate: date },
          _sum: { amount: true },
        });
        const closing = await tx.hotelDayClosing.create({
          data: {
            propertyId,
            businessDate: date,
            roomCharges: total._sum.amount ?? new Prisma.Decimal(0),
            closedById: user.userId,
          },
        });
        await tx.hotelProperty.update({
          where: { id: propertyId },
          data: { businessDate: addHotelDays(date, 1) },
        });
        await this.audit.log(
          user,
          {
            action: 'hotel.day.close',
            entityType: 'HotelDayClosing',
            entityId: closing.id,
            outletId: property.outletId,
            after: { date: dto.date, roomCharges: closing.roomCharges },
          },
          tx,
        );
        return closing;
      },
      { timeout: 20_000 },
    );
  }
}
