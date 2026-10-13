import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addHotelDays, hotelDateKey, hotelNights, hotelToday } from '@pos/shared';
import { AuthUser } from '../../auth/decorators';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CancelReservationDto, ChangeStayDto, ReservationDto } from '../dto';
import { HotelDb, parseHotelDate, PmsAccessService } from '../pms-access.service';
import { HotelFoliosService } from '../folios/folios.service';

@Injectable()
export class HotelReservationsService {
  constructor(
    private prisma: PrismaService,
    private access: PmsAccessService,
    private folios: HotelFoliosService,
    private audit: AuditService,
  ) {}

  async list(user: AuthUser, propertyId: string, from: string, to: string) {
    await this.access.property(user, propertyId);
    const arrival = parseHotelDate(from),
      departure = parseHotelDate(to);
    if (hotelNights(arrival, departure) < 1 || hotelNights(arrival, departure) > 366)
      throw new BadRequestException('Choose a date range of 1–366 days');
    return this.prisma.hotelReservation.findMany({
      where: {
        propertyId,
        OR: [{ arrival: { lt: departure }, departure: { gt: arrival } }, { status: 'CHECKED_IN' }],
      },
      include: { guest: true, room: true },
      orderBy: { arrival: 'asc' },
    });
  }

  private async available(
    db: HotelDb,
    propertyId: string,
    roomId: string,
    arrival: Date,
    departure: Date,
    guests: number,
    except?: string,
  ) {
    const room = await db.hotelRoom.findFirst({
      where: { id: roomId, propertyId },
      include: { roomType: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.status === 'MAINTENANCE')
      throw new BadRequestException('This room is blocked for maintenance');
    if (guests > room.roomType.capacity)
      throw new BadRequestException('Guest count exceeds room capacity');
    const conflict = await db.hotelReservation.findFirst({
      where: {
        propertyId,
        roomId,
        id: except ? { not: except } : undefined,
        status: { in: ['RESERVED', 'CHECKED_IN'] },
        arrival: { lt: departure },
        departure: { gt: arrival },
      },
    });
    if (conflict) throw new ConflictException('This room is already booked for those dates');
    return room;
  }

  async create(user: AuthUser, propertyId: string, dto: ReservationDto) {
    const arrival = parseHotelDate(dto.arrival),
      departure = parseHotelDate(dto.departure);
    if (hotelNights(arrival, departure) < 1 || hotelNights(arrival, departure) > 365)
      throw new BadRequestException('A stay must be between 1 and 365 nights');
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const known = await tx.hotelReservation.findUnique({
        where: { id: dto.id },
        include: { guest: true },
      });
      if (known) {
        if (
          known.propertyId !== propertyId ||
          known.roomId !== dto.roomId ||
          hotelDateKey(known.arrival) !== dto.arrival ||
          hotelDateKey(known.departure) !== dto.departure ||
          known.guests !== dto.guests ||
          known.guest.name !== dto.guestName ||
          known.guest.phone !== dto.phone ||
          known.guest.email !== (dto.email ?? null) ||
          known.notes !== (dto.notes ?? null)
        )
          throw new ConflictException('This reservation ID has already been used');
        return this.folios.get(user, propertyId, known.id, tx);
      }
      if (arrival < property.businessDate)
        throw new BadRequestException('Arrival cannot be before the hotel business date');
      const room = await this.available(tx, propertyId, dto.roomId, arrival, departure, dto.guests);
      const guest = await tx.hotelGuest.create({
        data: { propertyId, name: dto.guestName, phone: dto.phone, email: dto.email },
      });
      const stay = await tx.hotelReservation.create({
        data: {
          id: dto.id,
          propertyId,
          roomId: room.id,
          guestId: guest.id,
          arrival,
          departure,
          guests: dto.guests,
          nightlyRate: room.roomType.nightlyRate,
          taxPercent: room.roomType.taxPercent,
          notes: dto.notes,
        },
      });
      await this.audit.log(
        user,
        {
          action: 'hotel.reservation.create',
          entityType: 'HotelReservation',
          entityId: stay.id,
          outletId: property.outletId,
          after: { roomId: room.id, arrival: dto.arrival, departure: dto.departure },
        },
        tx,
      );
      return this.folios.get(user, propertyId, stay.id, tx);
    });
  }

  async checkIn(user: AuthUser, propertyId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const stay = await this.access.reservation(user, propertyId, id, tx);
      if (stay.status === 'CHECKED_IN') return this.folios.get(user, propertyId, id, tx);
      if (stay.status !== 'RESERVED')
        throw new BadRequestException('Only confirmed reservations can check in');
      if (
        hotelDateKey(stay.arrival) !== hotelDateKey(property.businessDate) ||
        hotelDateKey(property.businessDate) !== hotelToday(property.outlet.timezone)
      )
        throw new BadRequestException(
          'Check-in requires the arrival date and current hotel business day; close overdue days first',
        );
      if (stay.room.status !== 'READY')
        throw new BadRequestException('Housekeeping must mark this room ready');
      if (await tx.hotelReservation.count({ where: { roomId: stay.roomId, status: 'CHECKED_IN' } }))
        throw new ConflictException('A guest is still checked into this room');
      await tx.hotelReservation.update({
        where: { id },
        data: { status: 'CHECKED_IN', checkedInAt: new Date() },
      });
      await this.audit.log(
        user,
        {
          action: 'hotel.check_in',
          entityType: 'HotelReservation',
          entityId: id,
          outletId: property.outletId,
        },
        tx,
      );
      return this.folios.get(user, propertyId, id, tx);
    });
  }

  async change(user: AuthUser, propertyId: string, id: string, dto: ChangeStayDto) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const stay = await this.access.reservation(user, propertyId, id, tx);
      if (!['RESERVED', 'CHECKED_IN'].includes(stay.status))
        throw new BadRequestException('This stay is closed');
      const departure = dto.departure ? parseHotelDate(dto.departure) : stay.departure;
      if (
        departure <= property.businessDate ||
        hotelNights(stay.arrival, departure) < 1 ||
        hotelNights(stay.arrival, departure) > 365
      )
        throw new BadRequestException('Choose a future departure within 365 nights of arrival');
      if (departure < stay.departure)
        throw new BadRequestException('Use early checkout to shorten a stay');
      const room = await this.available(
        tx,
        propertyId,
        dto.roomId ?? stay.roomId,
        stay.arrival,
        departure,
        stay.guests,
        id,
      );
      if (room.id !== stay.roomId && stay.status === 'CHECKED_IN') {
        if (
          room.status !== 'READY' ||
          (await tx.hotelReservation.count({
            where: { roomId: room.id, status: 'CHECKED_IN', id: { not: id } },
          }))
        )
          throw new BadRequestException('The destination room must be ready and unoccupied');
        await tx.hotelRoom.update({ where: { id: stay.roomId }, data: { status: 'DIRTY' } });
      }
      await tx.hotelReservation.update({
        where: { id },
        data: { roomId: room.id, departure, allowRoomCharges: dto.allowRoomCharges },
      });
      await this.audit.log(
        user,
        {
          action: 'hotel.stay.change',
          entityType: 'HotelReservation',
          entityId: id,
          outletId: property.outletId,
          before: { roomId: stay.roomId, departure: stay.departure },
          after: dto,
        },
        tx,
      );
      return this.folios.get(user, propertyId, id, tx);
    });
  }

  async cancel(user: AuthUser, propertyId: string, id: string, dto: CancelReservationDto) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const stay = await this.access.reservation(user, propertyId, id, tx);
      if (stay.status !== 'RESERVED')
        throw new BadRequestException('Only a reserved stay can be cancelled or marked no-show');
      if (dto.status === 'NO_SHOW' && stay.arrival > property.businessDate)
        throw new BadRequestException('Arrival day has not started');
      await tx.hotelReservation.update({ where: { id }, data: { status: dto.status } });
      await this.audit.log(
        user,
        {
          action: 'hotel.reservation.cancel',
          entityType: 'HotelReservation',
          entityId: id,
          outletId: property.outletId,
          after: dto,
        },
        tx,
      );
      return this.folios.get(user, propertyId, id, tx);
    });
  }

  async checkout(user: AuthUser, propertyId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const stay = await this.access.reservation(user, propertyId, id, tx);
      if (stay.status === 'CHECKED_OUT') return this.folios.get(user, propertyId, id, tx);
      if (stay.status !== 'CHECKED_IN') throw new BadRequestException('Guest is not checked in');
      if (hotelDateKey(property.businessDate) !== hotelToday(property.outlet.timezone))
        throw new BadRequestException('Close overdue hotel business days before checkout');
      if (property.businessDate > stay.departure)
        throw new BadRequestException('Extend the overdue stay before checkout');
      const departure =
        property.businessDate > stay.arrival
          ? property.businessDate
          : addHotelDays(stay.arrival, 1);
      await this.folios.postNights(tx, stay, departure, user);
      const current = await this.folios.get(user, propertyId, id, tx);
      if (current.balance !== 0)
        throw new BadRequestException(
          current.balance > 0
            ? `Collect the remaining ${current.balance.toFixed(2)} before checkout`
            : 'Refund or resolve the guest credit before checkout',
        );
      await tx.hotelReservation.update({
        where: { id },
        data: { status: 'CHECKED_OUT', departure, checkedOutAt: new Date() },
      });
      await tx.hotelRoom.update({ where: { id: stay.roomId }, data: { status: 'DIRTY' } });
      await this.audit.log(
        user,
        {
          action: 'hotel.check_out',
          entityType: 'HotelReservation',
          entityId: id,
          outletId: property.outletId,
          after: { departure: hotelDateKey(departure) },
        },
        tx,
      );
      return this.folios.get(user, propertyId, id, tx);
    });
  }
}
