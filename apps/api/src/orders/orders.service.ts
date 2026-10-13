import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  businessDate,
  calculateBill,
  financialYear,
  outletSettings,
  toPaise,
  type TaxRate,
} from '@pos/shared';
import { OrderStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { canAccessOutlet } from '../common/access';
import { nextNumber } from '../common/counters';
import { clientTime, requireDevicePrefix } from '../common/offline';
import { requirePermission } from '../common/permissions';
import { EventsService } from '../events/events.service';
import { StockService } from '../inventory/stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { PmsAccessService } from '../pms/pms-access.service';
import {
  AddItemsDto,
  BillDto,
  CreateOrderDto,
  DiscountDto,
  PayDto,
  UpdateItemDto,
  UpdateOrderDto,
} from './dto';

const ACTIVE: OrderStatus[] = ['OPEN', 'BILLED'];

const orderInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: { modifiers: { select: { id: true, name: true, price: true, quantity: true } } },
  },
  discounts: { where: { orderItemId: null } },
  payments: { where: { status: 'SUCCESS' }, orderBy: { paidAt: 'asc' } },
  invoices: { where: { status: 'ISSUED' }, include: { taxLines: true } },
  table: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true, creditBalance: true } },
  kots: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, kotNo: true, status: true, stationId: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private events: EventsService,
    private audit: AuditService,
    private stock: StockService,
    private hotels: PmsAccessService,
  ) {}

  // ---- reading -------------------------------------------------------------

  async get(user: AuthUser, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId: user.tenantId },
      include: orderInclude,
    });
    if (!order || !canAccessOutlet(user, order.outletId))
      throw new NotFoundException('Order not found');
    return present(order);
  }

  async active(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);
    const orders = await this.prisma.order.findMany({
      where: { outletId, status: { in: ACTIVE } },
      include: orderInclude,
      orderBy: { openedAt: 'asc' },
    });
    return orders.map(present);
  }

  async history(
    user: AuthUser,
    q: {
      outletId?: string;
      from?: string;
      to?: string;
      status?: OrderStatus;
      search?: string;
      page: number;
    },
  ) {
    if (q.outletId) await this.business.outletFor(user, q.outletId);

    const search = q.search?.trim();
    const where: Prisma.OrderWhereInput = {
      tenantId: user.tenantId,
      outletId: q.outletId ?? (user.outletIds ? { in: user.outletIds } : undefined),
      status: q.status,
      businessDate: {
        gte: q.from ? new Date(q.from) : undefined,
        lte: q.to ? new Date(q.to) : undefined,
      },
      ...(search && {
        OR: [
          { orderNo: search },
          { customerPhone: { contains: search } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { invoices: { some: { invoiceNo: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const pageSize = 30;
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (q.page - 1) * pageSize,
        take: pageSize,
        include: {
          table: { select: { name: true } },
          invoices: { select: { invoiceNo: true, status: true } },
          payments: { where: { status: 'SUCCESS' }, select: { method: true, amount: true } },
          _count: { select: { items: { where: { status: { not: 'CANCELLED' } } } } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { rows, total, pageSize };
  }

  // ---- creating and editing -------------------------------------------------

  async create(user: AuthUser, dto: CreateOrderDto) {
    const outlet = await this.business.outletFor(user, dto.outletId);

    // retried request from a flaky connection
    if (dto.id) {
      const existing = await this.prisma.order.findFirst({
        where: { id: dto.id, tenantId: user.tenantId },
      });
      if (existing) return this.get(user, existing.id);
    }

    if (dto.type === 'DINE_IN' && !dto.tableId) {
      throw new BadRequestException('Pick a table for a dine-in order');
    }

    if (dto.orderNo) requireDevicePrefix(user, dto.orderNo, (code) => `${code}-`);

    const customerId = dto.customerPhone
      ? await this.upsertCustomer(user.tenantId, dto.customerPhone, dto.customerName)
      : undefined;
    const openedAt = clientTime(dto.openedAt);
    const date = businessDate(openedAt, outlet.timezone, outlet.dayStartTime);

    const order = await this.prisma.$transaction(async (tx) => {
      if (dto.tableId) await this.claimTable(tx, outlet.id, dto.tableId);
      const orderNo = dto.orderNo ?? String(await nextNumber(tx, outlet.id, `order:${date}`));

      return tx.order.create({
        data: {
          id: dto.id,
          tenantId: user.tenantId,
          outletId: outlet.id,
          businessDate: new Date(date),
          orderNo,
          openedAt,
          type: dto.type,
          tableId: dto.type === 'DINE_IN' ? dto.tableId : null,
          covers: dto.covers,
          customerId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          notes: dto.notes,
          waiterId: user.userId,
          createdById: user.userId,
        },
      });
    });

    this.notify(order.outletId, order.id, Boolean(order.tableId));
    return this.get(user, order.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateOrderDto) {
    const order = await this.loadActive(user, id);
    const type = dto.type ?? order.type;
    const tableId = type === 'DINE_IN' ? (dto.tableId ?? order.tableId) : null;
    if (type === 'DINE_IN' && !tableId)
      throw new BadRequestException('Pick a table for a dine-in order');

    const customerId = dto.customerPhone
      ? await this.upsertCustomer(user.tenantId, dto.customerPhone, dto.customerName)
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      if (tableId !== order.tableId) {
        if (tableId)
          await this.claimTable(tx, order.outletId, tableId, order.id, order.status === 'BILLED');
        if (order.tableId) await this.releaseTable(tx, order.tableId);
      }

      await tx.order.update({
        where: { id },
        data: {
          type,
          tableId,
          covers: dto.covers,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerId,
          notes: dto.notes,
        },
      });

      // service charge only applies to dine-in, so a type change moves the total
      if (type !== order.type && order.status === 'OPEN') await this.recalculate(tx, id);
    });

    this.notify(order.outletId, id, true);
    return this.get(user, id);
  }

  async addItems(user: AuthUser, id: string, dto: AddItemsDto) {
    const order = await this.loadActive(user, id);
    if (order.status !== 'OPEN') {
      throw new BadRequestException('The bill is already printed. Reopen it to add items.');
    }

    const known = await this.prisma.orderItem.findMany({
      where: { id: { in: dto.items.map((i) => i.id).filter(Boolean) as string[] } },
      select: { id: true },
    });
    const fresh = dto.items.filter((i) => !i.id || !known.some((k) => k.id === i.id));
    if (!fresh.length) return this.get(user, id);

    const menu = await this.prisma.menuItem.findMany({
      where: {
        id: { in: fresh.map((i) => i.menuItemId) },
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        variants: { where: { isActive: true } },
        taxGroup: { include: { components: { orderBy: { sortOrder: 'asc' } } } },
        outletSettings: { where: { outletId: order.outletId } },
        prices: { where: { outletId: order.outletId, orderType: order.type } },
        modifierGroups: {
          include: { modifierGroup: { include: { options: { where: { isActive: true } } } } },
        },
      },
    });

    const rows = fresh.map((input) => {
      const item = menu.find((m) => m.id === input.menuItemId);
      if (!item) throw new NotFoundException('Menu item not found');

      const setting = item.outletSettings[0];
      if (!item.isActive || setting?.isAvailable === false) {
        throw new BadRequestException(`${item.name} is not on the menu`);
      }
      if (setting?.isOutOfStock) throw new BadRequestException(`${item.name} is out of stock`);

      let variant: (typeof item.variants)[number] | undefined;
      if (item.hasVariants) {
        variant = item.variants.find((v) => v.id === input.variantId);
        if (!variant) throw new BadRequestException(`Pick a portion for ${item.name}`);
      } else if (input.variantId) {
        throw new BadRequestException(`${item.name} has no portions`);
      }

      const override = item.prices.find((p) => p.variantId === (variant?.id ?? null));
      const unitPrice = Number(override?.price ?? variant?.price ?? item.basePrice);

      const options = this.pickModifiers(item, input.modifierOptionIds ?? []);
      const modifiersTotal = options.reduce((sum, o) => sum + Number(o.price), 0);

      const taxes: TaxRate[] =
        item.taxGroup?.components.map((c) => ({ name: c.name, rate: Number(c.rate) })) ?? [];

      return {
        id: input.id,
        tenantId: user.tenantId,
        orderId: id,
        menuItemId: item.id,
        variantId: variant?.id,
        stationId: setting?.stationId,
        itemName: item.name,
        variantName: variant?.name,
        foodType: item.foodType,
        hsnCode: item.hsnCode,
        unitPrice,
        taxBreakup: taxes.map((t) => ({ ...t, amount: 0 })),
        quantity: input.quantity,
        modifiersTotal,
        taxableAmount: 0,
        taxAmount: 0,
        lineTotal: 0,
        notes: input.notes,
        createdById: user.userId,
        options,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      for (const { options, ...row } of rows) {
        await tx.orderItem.create({
          data: {
            ...row,
            modifiers: {
              create: options.map((o) => ({
                tenantId: user.tenantId,
                modifierOptionId: o.id,
                name: o.name,
                price: o.price,
              })),
            },
          },
        });
      }
      await this.recalculate(tx, id);
    });

    this.notify(order.outletId, id);
    return this.get(user, id);
  }

  async updateItem(user: AuthUser, id: string, itemId: string, dto: UpdateItemDto) {
    const order = await this.loadActive(user, id);
    const item = await this.findItem(id, itemId);
    if (item.status !== 'PENDING') {
      throw new BadRequestException('Already sent to the kitchen. Cancel it instead.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity, notes: dto.notes },
      });
      await this.recalculate(tx, id);
    });

    this.notify(order.outletId, id);
    return this.get(user, id);
  }

  async cancelItem(user: AuthUser, id: string, itemId: string, reason?: string) {
    const order = await this.loadActive(user, id);
    if (order.status !== 'OPEN') {
      throw new BadRequestException('The bill is already printed. Reopen it first.');
    }
    const item = await this.findItem(id, itemId);

    if (item.status === 'CANCELLED') return this.get(user, id);

    await this.prisma.$transaction(async (tx) => {
      if (item.status === 'PENDING') {
        // never reached the kitchen, nothing to keep
        await tx.orderItem.delete({ where: { id: itemId } });
      } else {
        requirePermission(user, 'order.cancel_item', 'Ask a manager to cancel items after the KOT');
        if (!reason || reason.length < 3)
          throw new BadRequestException('Add a reason for cancelling');

        await tx.orderItem.update({
          where: { id: itemId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: user.userId,
            cancelReason: reason,
          },
        });
        await this.audit.log(
          user,
          {
            action: 'order.item_cancel',
            entityType: 'Order',
            entityId: id,
            outletId: order.outletId,
            before: { item: item.itemName, quantity: item.quantity, status: item.status },
            after: { reason },
          },
          tx,
        );
      }
      await this.recalculate(tx, id);
    });

    this.notify(order.outletId, id);
    if (item.status !== 'PENDING') this.events.emit({ outletId: order.outletId, type: 'kot' });
    return this.get(user, id);
  }

  async sendKot(user: AuthUser, id: string) {
    const order = await this.loadActive(user, id);
    const kots = await this.prisma.$transaction((tx) => this.createKots(tx, order, user.userId));
    if (!kots.length) throw new BadRequestException('Nothing new to send to the kitchen');

    this.notify(order.outletId, id);
    this.events.emit({ outletId: order.outletId, type: 'kot' });
    return kots;
  }

  async setDiscount(user: AuthUser, id: string, dto: DiscountDto) {
    const order = await this.loadActive(user, id);
    if (order.status !== 'OPEN') {
      throw new BadRequestException(
        'The bill is already printed. Reopen it to change the discount.',
      );
    }
    if (dto.type === 'PERCENT' && dto.value > 100) {
      throw new BadRequestException("Discount can't be more than 100%");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDiscount.deleteMany({ where: { orderId: id, orderItemId: null } });
      await tx.orderDiscount.create({
        data: {
          tenantId: user.tenantId,
          orderId: id,
          name: dto.type === 'PERCENT' ? `${dto.value}% off` : `₹${dto.value} off`,
          type: dto.type,
          value: dto.value,
          amount: 0,
          reason: dto.reason,
          appliedById: user.userId,
        },
      });
      const bill = await this.recalculate(tx, id);
      await this.audit.log(
        user,
        {
          action: 'order.discount',
          entityType: 'Order',
          entityId: id,
          outletId: order.outletId,
          after: { ...dto, amount: bill.discount },
        },
        tx,
      );
    });

    this.notify(order.outletId, id);
    return this.get(user, id);
  }

  async removeDiscount(user: AuthUser, id: string) {
    const order = await this.loadActive(user, id);
    if (order.status !== 'OPEN') throw new BadRequestException('The bill is already printed.');

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDiscount.deleteMany({ where: { orderId: id, orderItemId: null } });
      await this.recalculate(tx, id);
    });

    this.notify(order.outletId, id);
    return this.get(user, id);
  }

  async chargeRoom(user: AuthUser, id: string, reservationId: string) {
    const reservation = await this.prisma.hotelReservation.findFirst({
      where: { id: reservationId, property: { tenantId: user.tenantId } },
      include: { property: true },
    });
    if (!reservation) throw new NotFoundException('Guest stay not found');
    await this.hotels.property(user, reservation.propertyId);
    const initial = await this.prisma.order.findFirst({ where: { id, tenantId: user.tenantId } });
    if (
      !initial ||
      !canAccessOutlet(user, initial.outletId) ||
      initial.outletId !== reservation.property.outletId
    )
      throw new NotFoundException('The order and guest stay must belong to this hotel outlet');
    if (initial.status === 'OPEN') await this.bill(user, id);
    await this.prisma.$transaction(async (tx) => {
      const property = await this.hotels.lock(user, reservation.propertyId, tx);
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, tenantId: user.tenantId } });
      const stay = await this.hotels.reservation(user, property.id, reservationId, tx);
      if (!order || order.outletId !== property.outletId)
        throw new NotFoundException('Order not found');
      const known = await tx.hotelFolioEntry.findUnique({ where: { orderId: id } });
      if (known) {
        if (known.reservationId !== reservationId)
          throw new ConflictException('This bill is already charged to another guest');
        return;
      }
      if (stay.status !== 'CHECKED_IN' || !stay.allowRoomCharges)
        throw new BadRequestException('This guest is not checked in or room charging is disabled');
      if (order.status !== 'BILLED' || Number(order.paidTotal) !== 0)
        throw new BadRequestException('Only an unpaid printed bill can be charged to a room');
      if (!(await tx.invoice.findFirst({ where: { orderId: id, status: 'ISSUED' } })))
        throw new BadRequestException('The restaurant invoice is missing');
      await tx.hotelFolioEntry.create({
        data: {
          reservationId,
          kind: 'RESTAURANT',
          description: `Restaurant bill ${order.orderNo}`,
          amount: order.grandTotal,
          taxAmount: order.taxTotal,
          businessDate: property.businessDate,
          sourceKey: `order:${id}`,
          orderId: id,
          createdById: user.userId,
        },
      });
      await tx.order.update({ where: { id }, data: { status: 'CHARGED', closedAt: new Date() } });
      await this.closeOut(tx, user, order);
      await this.audit.log(
        user,
        {
          action: 'hotel.restaurant.charge',
          entityType: 'Order',
          entityId: id,
          outletId: property.outletId,
          after: { reservationId, amount: order.grandTotal },
        },
        tx,
      );
    });
    this.notify(initial.outletId, id, Boolean(initial.tableId));
    return this.get(user, id);
  }

  // ---- billing ---------------------------------------------------------------

  async bill(user: AuthUser, id: string, offline: BillDto = {}) {
    let order = await this.loadActive(user, id);
    if (order.status === 'BILLED') return this.get(user, id);

    const outlet = await this.business.findOutlet(user.tenantId, order.outletId);
    const activeItems = await this.prisma.orderItem.count({
      where: { orderId: id, status: { not: 'CANCELLED' } },
    });
    if (!activeItems) throw new BadRequestException('Add items before printing the bill');

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
      order = await this.loadActive(user, id, tx);
      if (order.status === 'BILLED') return;
      // anything still in the cart goes to the kitchen with the bill
      await this.createKots(tx, order, user.userId);

      const bill = await this.recalculate(tx, id);
      const date = isoDate(order.businessDate);
      const fy = financialYear(date);
      if (offline.invoiceNo) {
        requireDevicePrefix(
          user,
          offline.invoiceNo,
          (code) => `${outlet.code}/${fy.slice(2)}/${code}-`,
        );
      }
      const invoiceNo =
        offline.invoiceNo ??
        `${outlet.code}/${fy.slice(2)}/${String(await nextNumber(tx, outlet.id, `invoice:${fy}`)).padStart(5, '0')}`;
      const issuedAt = clientTime(offline.issuedAt);
      const customer = order.customerId
        ? await tx.customer.findUnique({ where: { id: order.customerId } })
        : null;

      await tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          outletId: outlet.id,
          orderId: id,
          invoiceNo,
          series: offline.invoiceNo ? user.deviceCode! : 'MAIN',
          issuedAt,
          financialYear: fy,
          businessDate: order.businessDate,
          customerName: order.customerName ?? customer?.name,
          customerPhone: order.customerPhone ?? customer?.phone,
          customerGstin: customer?.gstin,
          placeOfSupply: outlet.stateCode,
          subtotal: bill.subtotal,
          discountTotal: bill.discount,
          serviceCharge: bill.serviceCharge,
          taxTotal: bill.tax,
          roundOff: bill.roundOff,
          grandTotal: bill.total,
          taxLines: {
            create: bill.taxSummary.map((t) => ({
              tenantId: user.tenantId,
              taxName: t.name,
              rate: t.rate,
              taxableAmount: t.taxable,
              taxAmount: t.amount,
            })),
          },
        },
      });

      await tx.order.update({ where: { id }, data: { status: 'BILLED', billedAt: issuedAt } });
      if (order.tableId) {
        await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'BILLED' } });
      }
    });

    this.notify(order.outletId, id, Boolean(order.tableId));
    this.events.emit({ outletId: order.outletId, type: 'kot' });
    return this.get(user, id);
  }

  /** Cancel the printed bill so items can be changed. The invoice is kept as cancelled. */
  async reopen(user: AuthUser, id: string, reason: string) {
    let order = await this.loadActive(user, id);
    if (order.status !== 'BILLED') throw new BadRequestException('This order has no printed bill');

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
      order = await this.loadActive(user, id, tx);
      if (order.status !== 'BILLED')
        throw new BadRequestException('This order has no printed bill');
      const paid = await tx.payment.count({ where: { orderId: id, status: 'SUCCESS' } });
      if (paid) throw new BadRequestException('Payment has been taken. Void the order instead.');
      const invoices = await tx.invoice.findMany({ where: { orderId: id, status: 'ISSUED' } });
      await tx.invoice.updateMany({
        where: { orderId: id, status: 'ISSUED' },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: user.userId,
          cancelReason: reason,
        },
      });
      await tx.order.update({ where: { id }, data: { status: 'OPEN', billedAt: null } });
      if (order.tableId) {
        await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'OCCUPIED' } });
      }
      await this.audit.log(
        user,
        {
          action: 'invoice.cancel',
          entityType: 'Order',
          entityId: id,
          outletId: order.outletId,
          before: { invoices: invoices.map((i) => i.invoiceNo), total: order.grandTotal },
          after: { reason },
        },
        tx,
      );
    });

    this.notify(order.outletId, id, Boolean(order.tableId));
    return this.get(user, id);
  }

  async pay(user: AuthUser, id: string, dto: PayDto) {
    const order = await this.prisma.order.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!order || !canAccessOutlet(user, order.outletId))
      throw new NotFoundException('Order not found');
    if (order.status === 'OPEN') {
      try {
        await this.bill(user, id);
      } catch (error) {
        // Another till may have finished billing and paying while we waited.
        // The locked payment check below still rejects any new payment on it.
        const current = await this.prisma.order.findUnique({ where: { id } });
        if (!(error instanceof BadRequestException) || current?.status !== 'PAID') throw error;
      }
    }

    const paymentIds = dto.payments.flatMap((p) => (p.id ? [p.id] : []));
    if (new Set(paymentIds).size !== paymentIds.length)
      throw new BadRequestException('Each payment needs a different ID');

    const result = await this.prisma.$transaction(async (tx) => {
      // Read the balance only after earlier payments on this order have committed.
      await tx.$queryRaw`
        SELECT id FROM "Order" WHERE id = ${id}::uuid AND "tenantId" = ${user.tenantId}::uuid FOR UPDATE
      `;
      const order = await tx.order.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!order || !canAccessOutlet(user, order.outletId))
        throw new NotFoundException('Order not found');

      const known = await tx.payment.findMany({
        where: { id: { in: paymentIds } },
        select: { id: true, orderId: true, status: true },
      });
      if (known.some((p) => p.orderId !== id || p.status !== 'SUCCESS'))
        throw new BadRequestException('This payment ID has already been used');
      const payments = dto.payments.filter((p) => !p.id || !known.some((k) => k.id === p.id));
      if (dto.payments.length && !payments.length)
        return { change: 0, settled: false, outletId: order.outletId, tableId: order.tableId };

      if (order.status !== 'BILLED')
        throw new BadRequestException(
          order.status === 'PAID'
            ? 'This order is already paid'
            : 'Print the bill before taking payment',
        );
      const shift = await tx.shift.findFirst({
        where: { outletId: order.outletId, status: 'OPEN' },
      });
      if (!shift) throw new BadRequestException('Open a cash shift before taking payments');

      if (payments.some((p) => p.method === 'CREDIT') && !order.customerId) {
        throw new BadRequestException('Add the customer’s phone number to put this on credit');
      }

      // all maths in paise
      const due = toPaise(order.grandTotal.toString()) - toPaise(order.paidTotal.toString());
      const nonCash = payments.filter((p) => p.method !== 'CASH');
      const cash = payments.filter((p) => p.method === 'CASH');
      const nonCashTotal = nonCash.reduce((sum, p) => sum + toPaise(p.amount), 0);
      const cashGiven = cash.reduce((sum, p) => sum + toPaise(p.amount), 0);

      if (nonCashTotal > due) throw new BadRequestException('That is more than the amount due');
      const cashApplied = Math.min(cashGiven, due - nonCashTotal);
      const change = cashGiven - cashApplied;

      const toSave = [
        ...nonCash.map((p) => ({ ...p, paise: toPaise(p.amount) })),
        ...(cashApplied > 0 ? [{ ...cash[0], amount: cashApplied / 100, paise: cashApplied }] : []),
      ];
      const paidNow = toSave.reduce((sum, p) => sum + p.paise, 0);
      if (!paidNow && due > 0) throw new BadRequestException('Add a payment');
      const settled = paidNow >= due;
      const paidAt = clientTime(dto.paidAt);
      const invoice = await tx.invoice.findFirst({
        where: { orderId: id, status: 'ISSUED' },
      });

      for (const [i, p] of toSave.entries()) {
        await tx.payment.create({
          data: {
            id: p.id,
            tenantId: user.tenantId,
            outletId: order.outletId,
            orderId: id,
            invoiceId: invoice?.id,
            shiftId: shift.id,
            method: p.method,
            amount: p.paise / 100,
            tipAmount: i === 0 ? (dto.tip ?? 0) : 0,
            reference: p.reference,
            receivedById: user.userId,
            paidAt,
          },
        });
        if (p.method === 'CREDIT') {
          await tx.customer.update({
            where: { id: order.customerId! },
            data: { creditBalance: { increment: p.paise / 100 } },
          });
        }
      }

      await tx.order.update({
        where: { id },
        data: {
          paidTotal: { increment: paidNow / 100 },
          ...(settled && { status: 'PAID', closedAt: paidAt }),
        },
      });

      if (settled) await this.closeOut(tx, user, order);
      return { change: change / 100, settled, outletId: order.outletId, tableId: order.tableId };
    });

    this.notify(result.outletId, id, result.settled && Boolean(result.tableId));
    return { order: await this.get(user, id), change: result.change };
  }

  async void(user: AuthUser, id: string, reason: string) {
    let order = await this.prisma.order.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { where: { status: { not: 'CANCELLED' } } } },
    });
    if (!order || !canAccessOutlet(user, order.outletId))
      throw new NotFoundException('Order not found');
    if (order.status === 'VOID') throw new BadRequestException('Already voided');

    // an order where nothing reached the kitchen can be dropped by whoever opened it
    const untouched = order.status === 'OPEN' && order.items.every((i) => i.status === 'PENDING');
    if (!untouched) requirePermission(user, 'bill.void', 'Ask a manager to void this order');

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
      order = await tx.order.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { items: { where: { status: { not: 'CANCELLED' } } } },
      });
      if (!order || !canAccessOutlet(user, order.outletId))
        throw new NotFoundException('Order not found');
      if (order.status === 'VOID') throw new BadRequestException('Already voided');
      if (order.status === 'CHARGED')
        throw new BadRequestException(
          'This bill is transferred to a hotel guest account. Resolve corrections in the hotel account.',
        );
      const untouched = order.status === 'OPEN' && order.items.every((i) => i.status === 'PENDING');
      if (!untouched) requirePermission(user, 'bill.void', 'Ask a manager to void this order');
      await tx.invoice.updateMany({
        where: { orderId: id, status: 'ISSUED' },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: user.userId,
          cancelReason: reason,
        },
      });

      if (order.status === 'PAID') {
        const payments = await tx.payment.findMany({ where: { orderId: id, status: 'SUCCESS' } });
        await tx.payment.updateMany({
          where: { orderId: id, status: 'SUCCESS' },
          data: { status: 'REFUNDED' },
        });

        const credit = payments
          .filter((p) => p.method === 'CREDIT')
          .reduce((s, p) => s + Number(p.amount), 0);
        if (order.customerId) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              creditBalance: credit ? { decrement: credit } : undefined,
              totalSpent: { decrement: Number(order.grandTotal) },
              visits: { decrement: 1 },
            },
          });
        }

        await this.stock.consumeForOrder(
          tx,
          order,
          order.items.map((i) => ({
            menuItemId: i.menuItemId,
            variantId: i.variantId,
            quantity: Number(i.quantity),
          })),
          -1,
          user.userId,
        );
      }

      await tx.kot.updateMany({
        where: { orderId: id, status: { in: ['NEW', 'PREPARING', 'READY'] } },
        data: { status: 'CANCELLED' },
      });

      await tx.order.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), voidedById: user.userId, voidReason: reason },
      });

      if (order.tableId && ACTIVE.includes(order.status))
        await this.releaseTable(tx, order.tableId);

      await this.audit.log(
        user,
        {
          action: 'order.void',
          entityType: 'Order',
          entityId: id,
          outletId: order.outletId,
          before: { status: order.status, orderNo: order.orderNo, total: order.grandTotal },
          after: { reason },
        },
        tx,
      );
    });

    this.notify(order.outletId, id, Boolean(order.tableId));
    this.events.emit({ outletId: order.outletId, type: 'kot' });
    return this.get(user, id);
  }

  // ---- internals -------------------------------------------------------------

  /** Recompute every line and the order totals from the saved snapshot prices. */
  private async recalculate(tx: Tx, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { where: { status: { not: 'CANCELLED' } } },
        discounts: { where: { orderItemId: null } },
        outlet: true,
      },
    });
    const discount = order.discounts[0];
    const settings = outletSettings(order.outlet.settings);

    const bill = calculateBill({
      lines: order.items.map((item) => ({
        key: item.id,
        unitPrice: Number(item.unitPrice),
        modifiersTotal: Number(item.modifiersTotal),
        quantity: Number(item.quantity),
        taxes: (item.taxBreakup as TaxRate[]).map((t) => ({ name: t.name, rate: Number(t.rate) })),
      })),
      discount: discount ? { type: discount.type, value: Number(discount.value) } : null,
      serviceChargePercent: order.type === 'DINE_IN' ? settings.serviceChargePercent : 0,
      priceIncludesTax: order.outlet.priceIncludesTax,
    });

    for (const line of bill.lines) {
      await tx.orderItem.update({
        where: { id: line.key },
        data: {
          discountAmount: line.discount,
          taxableAmount: line.taxable,
          taxAmount: line.tax,
          lineTotal: line.total,
          taxBreakup: line.taxes,
        },
      });
    }
    if (discount) {
      await tx.orderDiscount.update({
        where: { id: discount.id },
        data: { amount: bill.discount },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: bill.subtotal,
        discountTotal: bill.discount,
        serviceCharge: bill.serviceCharge,
        taxTotal: bill.tax,
        roundOff: bill.roundOff,
        grandTotal: bill.total,
      },
    });
    return bill;
  }

  private async createKots(
    tx: Tx,
    order: { id: string; tenantId: string; outletId: string; businessDate: Date },
    userId: string,
  ) {
    const pending = await tx.orderItem.findMany({
      where: { orderId: order.id, status: 'PENDING' },
      select: { id: true, stationId: true },
    });
    if (!pending.length) return [];

    const byStation = new Map<string | null, string[]>();
    for (const item of pending) {
      byStation.set(item.stationId, [...(byStation.get(item.stationId) ?? []), item.id]);
    }

    const date = isoDate(order.businessDate);
    const kots = [];
    for (const [stationId, itemIds] of byStation) {
      const number = await nextNumber(tx, order.outletId, `kot:${date}`);
      const kot = await tx.kot.create({
        data: {
          tenantId: order.tenantId,
          outletId: order.outletId,
          orderId: order.id,
          stationId,
          kotNo: String(number),
          createdById: userId,
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { status: 'SENT', kotId: kot.id },
      });
      kots.push(
        await tx.kot.findUniqueOrThrow({
          where: { id: kot.id },
          include: {
            station: { select: { name: true } },
            items: { include: { modifiers: { select: { name: true } } } },
            order: { select: { orderNo: true, type: true, table: { select: { name: true } } } },
          },
        }),
      );
    }
    return kots;
  }

  /** Runs once an order is fully paid. */
  private async closeOut(
    tx: Tx,
    user: AuthUser,
    order: {
      id: string;
      tenantId: string;
      outletId: string;
      tableId: string | null;
      customerId: string | null;
      grandTotal: Prisma.Decimal;
    },
  ) {
    if (order.tableId) await this.releaseTable(tx, order.tableId);

    const items = await tx.orderItem.findMany({
      where: { orderId: order.id, status: { not: 'CANCELLED' } },
      select: { menuItemId: true, variantId: true, quantity: true },
    });
    await this.stock.consumeForOrder(
      tx,
      order,
      items.map((i) => ({ ...i, quantity: Number(i.quantity) })),
      1,
      user.userId,
    );

    if (order.customerId) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          visits: { increment: 1 },
          totalSpent: { increment: Number(order.grandTotal) },
          lastVisitAt: new Date(),
        },
      });
    }
  }

  private pickModifiers(
    item: {
      name: string;
      modifierGroups: {
        modifierGroup: {
          id: string;
          name: string;
          minSelect: number;
          maxSelect: number;
          isActive: boolean;
          options: { id: string; name: string; price: Prisma.Decimal }[];
        };
      }[];
    },
    optionIds: string[],
  ) {
    const picked = [];
    for (const { modifierGroup: group } of item.modifierGroups) {
      if (!group.isActive) continue;
      const chosen = group.options.filter((o) => optionIds.includes(o.id));
      if (chosen.length < group.minSelect) {
        throw new BadRequestException(`Choose ${group.name.toLowerCase()} for ${item.name}`);
      }
      if (chosen.length > group.maxSelect) {
        throw new BadRequestException(
          `Pick at most ${group.maxSelect} ${group.name.toLowerCase()}`,
        );
      }
      picked.push(...chosen);
    }
    if (picked.length !== optionIds.length) {
      throw new BadRequestException(`Some add-ons don't belong to ${item.name}`);
    }
    return picked;
  }

  private async claimTable(
    tx: Tx,
    outletId: string,
    tableId: string,
    orderId?: string,
    billed = false,
  ) {
    // lock the row so two waiters can't open the same table at once
    await tx.$executeRaw`SELECT 1 FROM "DiningTable" WHERE "id" = ${tableId}::uuid FOR UPDATE`;

    const table = await tx.diningTable.findFirst({
      where: { id: tableId, outletId, isActive: true },
    });
    if (!table) throw new NotFoundException('Table not found');

    const busy = await tx.order.findFirst({
      where: { tableId, status: { in: ACTIVE }, id: orderId ? { not: orderId } : undefined },
      select: { orderNo: true },
    });
    if (busy) throw new ConflictException(`${table.name} already has order #${busy.orderNo}`);

    await tx.diningTable.update({
      where: { id: tableId },
      data: { status: billed ? 'BILLED' : 'OCCUPIED' },
    });
  }

  private releaseTable(tx: Tx, tableId: string) {
    return tx.diningTable.update({ where: { id: tableId }, data: { status: 'AVAILABLE' } });
  }

  private async loadActive(user: AuthUser, id: string, db: Tx = this.prisma) {
    const order = await db.order.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!order || !canAccessOutlet(user, order.outletId))
      throw new NotFoundException('Order not found');
    if (!ACTIVE.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'PAID' ? 'This order is already paid' : 'This order was voided',
      );
    }
    return order;
  }

  private async findItem(orderId: string, itemId: string) {
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  private async upsertCustomer(tenantId: string, phone: string, name?: string) {
    const customer = await this.prisma.customer.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      create: { tenantId, phone, name },
      update: {},
    });
    if (name && !customer.name) {
      await this.prisma.customer.update({ where: { id: customer.id }, data: { name } });
    }
    return customer.id;
  }

  private notify(outletId: string, orderId: string, tables = false) {
    this.events.emit({ outletId, type: 'order', id: orderId });
    if (tables) this.events.emit({ outletId, type: 'table' });
  }
}

function present({ invoices, discounts, ...order }: OrderRow) {
  return { ...order, invoice: invoices[0] ?? null, discount: discounts[0] ?? null };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
