import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KotStatus, OrderItemStatus } from '@prisma/client';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { canAccessOutlet } from '../common/access';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';

// a ticket moves forward only
const FLOW: KotStatus[] = ['NEW', 'PREPARING', 'READY', 'SERVED'];

@Injectable()
export class KitchenService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private events: EventsService,
  ) {}

  async tickets(user: AuthUser, outletId: string, stationId?: string) {
    await this.business.outletFor(user, outletId);

    return this.prisma.kot.findMany({
      where: {
        outletId,
        stationId,
        // served tickets stay for a few minutes so the pass can see them go
        OR: [
          { status: { in: ['NEW', 'PREPARING', 'READY'] } },
          { status: 'SERVED', updatedAt: { gt: new Date(Date.now() - 10 * 60_000) } },
        ],
        createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        station: { select: { id: true, name: true } },
        order: {
          select: { id: true, orderNo: true, type: true, table: { select: { name: true } } },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            itemName: true,
            variantName: true,
            quantity: true,
            notes: true,
            status: true,
            foodType: true,
            modifiers: { select: { name: true } },
          },
        },
      },
    });
  }

  async setStatus(user: AuthUser, id: string, status: KotStatus) {
    const kot = await this.prisma.kot.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!kot || !canAccessOutlet(user, kot.outletId)) throw new NotFoundException('KOT not found');
    if (kot.status === 'CANCELLED') throw new BadRequestException('This KOT was cancelled');
    if (status === 'CANCELLED')
      throw new BadRequestException('Cancel items from the order instead');

    // allow one step back in case someone taps the wrong ticket
    const from = FLOW.indexOf(kot.status);
    const to = FLOW.indexOf(status);
    if (to < from - 1) throw new BadRequestException('Can’t move this ticket that far back');

    const itemStatus: OrderItemStatus = status === 'NEW' ? 'SENT' : status;

    await this.prisma.$transaction([
      this.prisma.kot.update({
        where: { id },
        data: { status, readyAt: status === 'READY' ? new Date() : undefined },
      }),
      this.prisma.orderItem.updateMany({
        where: { kotId: id, status: { not: 'CANCELLED' } },
        data: { status: itemStatus },
      }),
    ]);

    this.events.emit({ outletId: kot.outletId, type: 'kot', id });
    this.events.emit({ outletId: kot.outletId, type: 'order', id: kot.orderId });
  }

  listStations(user: AuthUser, outletId: string) {
    return this.business.outletFor(user, outletId).then(() =>
      this.prisma.kitchenStation.findMany({
        where: { outletId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { menuItems: true } } },
      }),
    );
  }

  async createStation(user: AuthUser, outletId: string, name: string) {
    await this.business.outletFor(user, outletId);
    return this.prisma.kitchenStation.create({
      data: { tenantId: user.tenantId, outletId, name },
    });
  }

  async updateStation(user: AuthUser, id: string, data: { name?: string; isActive?: boolean }) {
    await this.findStation(user, id);
    return this.prisma.kitchenStation.update({ where: { id }, data });
  }

  async removeStation(user: AuthUser, id: string) {
    await this.findStation(user, id);
    await this.prisma.$transaction([
      this.prisma.outletMenuItem.updateMany({
        where: { stationId: id },
        data: { stationId: null },
      }),
      this.prisma.kot.updateMany({ where: { stationId: id }, data: { stationId: null } }),
      this.prisma.kitchenStation.delete({ where: { id } }),
    ]);
  }

  /** Which station each menu item goes to at this outlet. */
  async assignItems(user: AuthUser, stationId: string, menuItemIds: string[]) {
    const station = await this.findStation(user, stationId);
    const count = await this.prisma.menuItem.count({
      where: { id: { in: menuItemIds }, tenantId: user.tenantId },
    });
    if (count !== menuItemIds.length) throw new BadRequestException('Unknown menu item');

    await this.prisma.$transaction([
      this.prisma.outletMenuItem.updateMany({
        where: { outletId: station.outletId, stationId, menuItemId: { notIn: menuItemIds } },
        data: { stationId: null },
      }),
      ...menuItemIds.map((menuItemId) =>
        this.prisma.outletMenuItem.upsert({
          where: { outletId_menuItemId: { outletId: station.outletId, menuItemId } },
          create: { tenantId: user.tenantId, outletId: station.outletId, menuItemId, stationId },
          update: { stationId },
        }),
      ),
    ]);
  }

  async stationItems(user: AuthUser, stationId: string) {
    await this.findStation(user, stationId);
    const rows = await this.prisma.outletMenuItem.findMany({
      where: { stationId },
      select: { menuItemId: true },
    });
    return rows.map((r) => r.menuItemId);
  }

  private async findStation(user: AuthUser, id: string) {
    const station = await this.prisma.kitchenStation.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!station || !canAccessOutlet(user, station.outletId))
      throw new NotFoundException('Station not found');
    return station;
  }
}
