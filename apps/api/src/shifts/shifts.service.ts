import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { businessDate } from '@pos/shared';
import { CashMovementType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { canAccessOutlet } from '../common/access';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private events: EventsService,
    private audit: AuditService,
  ) {}

  async current(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);
    const shift = await this.prisma.shift.findFirst({ where: { outletId, status: 'OPEN' } });
    return shift ? this.withSummary(shift.id) : null;
  }

  async history(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);
    const shifts = await this.prisma.shift.findMany({
      where: { outletId },
      orderBy: { openedAt: 'desc' },
      take: 60,
    });
    const names = await this.userNames(shifts.flatMap((s) => [s.openedById, s.closedById]));
    return shifts.map((s) => ({
      ...s,
      openedBy: names.get(s.openedById) ?? null,
      closedBy: s.closedById ? (names.get(s.closedById) ?? null) : null,
    }));
  }

  async open(user: AuthUser, outletId: string, openingCash: number) {
    const outlet = await this.business.outletFor(user, outletId);
    const existing = await this.prisma.shift.findFirst({ where: { outletId, status: 'OPEN' } });
    if (existing) throw new ConflictException('A shift is already open at this outlet');

    const shift = await this.prisma.shift.create({
      data: {
        tenantId: user.tenantId,
        outletId,
        businessDate: new Date(businessDate(new Date(), outlet.timezone, outlet.dayStartTime)),
        openedById: user.userId,
        openingCash,
      },
    });
    this.events.emit({ outletId, type: 'shift' });
    return this.withSummary(shift.id);
  }

  async addCash(
    user: AuthUser,
    id: string,
    type: CashMovementType,
    amount: number,
    reason: string,
  ) {
    const shift = await this.findOpen(user, id);
    await this.prisma.cashMovement.create({
      data: {
        tenantId: user.tenantId,
        shiftId: id,
        type,
        amount,
        reason,
        createdById: user.userId,
      },
    });
    await this.audit.log(user, {
      action: type === 'PAY_IN' ? 'cash.pay_in' : 'cash.pay_out',
      entityType: 'Shift',
      entityId: id,
      outletId: shift.outletId,
      after: { amount, reason },
    });
    this.events.emit({ outletId: shift.outletId, type: 'shift' });
    return this.withSummary(id);
  }

  async close(user: AuthUser, id: string, closingCash: number, notes?: string) {
    const shift = await this.findOpen(user, id);

    const open = await this.prisma.order.count({
      where: { outletId: shift.outletId, status: 'BILLED' },
    });
    if (open) {
      throw new BadRequestException(
        `${open} printed ${open === 1 ? 'bill is' : 'bills are'} still unpaid. Settle or void ${open === 1 ? 'it' : 'them'} first.`,
      );
    }

    const summary = await this.withSummary(id);
    const difference = round2(closingCash - summary.expectedCash);

    await this.prisma.shift.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById: user.userId,
        closedAt: new Date(),
        expectedCash: summary.expectedCash,
        closingCash,
        difference,
        notes,
      },
    });
    await this.audit.log(user, {
      action: 'shift.close',
      entityType: 'Shift',
      entityId: id,
      outletId: shift.outletId,
      after: { expected: summary.expectedCash, counted: closingCash, difference },
    });
    this.events.emit({ outletId: shift.outletId, type: 'shift' });
    return this.withSummary(id);
  }

  async get(user: AuthUser, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!shift || !canAccessOutlet(user, shift.outletId))
      throw new NotFoundException('Shift not found');
    return this.withSummary(id);
  }

  /** Shift with payment totals and the cash that should be in the drawer. */
  private async withSummary(id: string) {
    const shift = await this.prisma.shift.findUniqueOrThrow({
      where: { id },
      include: { cashMovements: { orderBy: { createdAt: 'asc' } } },
    });

    const byMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { shiftId: id, status: 'SUCCESS' },
      _sum: { amount: true, tipAmount: true },
      _count: true,
    });
    const refunded = await this.prisma.payment.aggregate({
      where: { shiftId: id, status: 'REFUNDED', method: 'CASH' },
      _sum: { amount: true },
    });

    const cashSales = Number(byMethod.find((m) => m.method === 'CASH')?._sum.amount ?? 0);
    const payIn = sum(
      shift.cashMovements.filter((m) => m.type === 'PAY_IN').map((m) => Number(m.amount)),
    );
    const payOut = sum(
      shift.cashMovements.filter((m) => m.type === 'PAY_OUT').map((m) => Number(m.amount)),
    );
    // a voided cash bill turns its payment into REFUNDED, so it drops out of
    // cashSales on its own — that cash went back to the customer
    const expectedCash = round2(Number(shift.openingCash) + cashSales + payIn - payOut);

    const names = await this.userNames([shift.openedById, shift.closedById]);

    return {
      ...shift,
      openedBy: names.get(shift.openedById) ?? null,
      closedBy: shift.closedById ? (names.get(shift.closedById) ?? null) : null,
      payments: byMethod.map((m) => ({
        method: m.method,
        count: m._count,
        amount: Number(m._sum.amount ?? 0),
        tips: Number(m._sum.tipAmount ?? 0),
      })),
      cashSales,
      refundedCash: Number(refunded._sum.amount ?? 0),
      payIn,
      payOut,
      expectedCash,
    };
  }

  private async findOpen(user: AuthUser, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!shift || !canAccessOutlet(user, shift.outletId))
      throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') throw new BadRequestException('This shift is already closed');
    return shift;
  }

  private async userNames(ids: (string | null)[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids.filter(Boolean) as string[] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
