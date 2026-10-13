import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { PrismaService } from '../prisma/prisma.service';

type Range = { outletId?: string; from: string; to: string };

const num = (v: unknown) => Number(v ?? 0);

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
  ) {}

  async sales(user: AuthUser, range: Range) {
    const scope = await this.scope(user, range);
    const paid = Prisma.sql`o."status" IN ('PAID', 'CHARGED') AND ${scope}`;

    const [summary] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) AS orders,
             coalesce(sum(o."grandTotal"), 0) AS total,
             coalesce(sum(o."subtotal"), 0) AS subtotal,
             coalesce(sum(o."discountTotal"), 0) AS discounts,
             coalesce(sum(o."taxTotal"), 0) AS tax,
             coalesce(sum(o."serviceCharge"), 0) AS "serviceCharge",
             coalesce(sum(o."covers"), 0) AS covers
      FROM "Order" o WHERE ${paid}`;

    const [voids] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) AS count, coalesce(sum(o."grandTotal"), 0) AS amount
      FROM "Order" o WHERE o."status" = 'VOID' AND ${scope}`;

    const byDay = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(o."businessDate", 'YYYY-MM-DD') AS date, count(*) AS orders,
             sum(o."grandTotal") AS total
      FROM "Order" o WHERE ${paid}
      GROUP BY o."businessDate" ORDER BY o."businessDate"`;

    const byHour = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT extract(hour FROM o."openedAt" AT TIME ZONE 'UTC' AT TIME ZONE ot."timezone")::int AS hour,
             count(*) AS orders, sum(o."grandTotal") AS total
      FROM "Order" o JOIN "Outlet" ot ON ot."id" = o."outletId"
      WHERE ${paid}
      GROUP BY 1 ORDER BY 1`;

    const byType = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT o."type" AS type, count(*) AS orders, sum(o."grandTotal") AS total
      FROM "Order" o WHERE ${paid}
      GROUP BY o."type" ORDER BY total DESC`;

    const byPayment = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p."method" AS method, count(*) AS count, sum(p."amount") AS amount, sum(p."tipAmount") AS tips
      FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
      WHERE p."status" = 'SUCCESS' AND ${paid}
      GROUP BY p."method" ORDER BY amount DESC`;

    const byStaff = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT u."id" AS id, u."name" AS name, count(*) AS orders, sum(o."grandTotal") AS total
      FROM "Order" o JOIN "User" u ON u."id" = o."waiterId"
      WHERE ${paid}
      GROUP BY u."id", u."name" ORDER BY total DESC`;

    return {
      range: { from: range.from, to: range.to },
      summary: {
        orders: num(summary.orders),
        total: num(summary.total),
        subtotal: num(summary.subtotal),
        discounts: num(summary.discounts),
        tax: num(summary.tax),
        serviceCharge: num(summary.serviceCharge),
        covers: num(summary.covers),
        averageBill: num(summary.orders)
          ? Math.round((num(summary.total) / num(summary.orders)) * 100) / 100
          : 0,
        voids: num(voids.count),
        voidAmount: num(voids.amount),
      },
      byDay: byDay.map((r) => ({
        date: r.date as string,
        orders: num(r.orders),
        total: num(r.total),
      })),
      byHour: byHour.map((r) => ({
        hour: num(r.hour),
        orders: num(r.orders),
        total: num(r.total),
      })),
      byType: byType.map((r) => ({
        type: r.type as string,
        orders: num(r.orders),
        total: num(r.total),
      })),
      byPayment: byPayment.map((r) => ({
        method: r.method as string,
        count: num(r.count),
        amount: num(r.amount),
        tips: num(r.tips),
      })),
      byStaff: byStaff.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        orders: num(r.orders),
        total: num(r.total),
      })),
    };
  }

  async items(user: AuthUser, range: Range) {
    const scope = await this.scope(user, range);

    const items = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT i."menuItemId" AS "menuItemId", i."itemName" AS name, i."variantName" AS variant,
             c."name" AS category, sum(i."quantity") AS quantity, sum(i."lineTotal") AS total,
             sum(i."taxableAmount") AS net
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      LEFT JOIN "MenuItem" m ON m."id" = i."menuItemId"
      LEFT JOIN "MenuCategory" c ON c."id" = m."categoryId"
      WHERE o."status" IN ('PAID', 'CHARGED') AND i."status" <> 'CANCELLED' AND ${scope}
      GROUP BY i."menuItemId", i."itemName", i."variantName", c."name"
      ORDER BY total DESC`;

    const categories = new Map<string, { category: string; quantity: number; total: number }>();
    for (const row of items) {
      const key = (row.category as string) ?? 'Uncategorised';
      const entry = categories.get(key) ?? { category: key, quantity: 0, total: 0 };
      entry.quantity += num(row.quantity);
      entry.total += num(row.total);
      categories.set(key, entry);
    }

    const cancelled = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT i."itemName" AS name, i."cancelReason" AS reason, i."quantity" AS quantity,
             i."cancelledAt" AS at, u."name" AS "by", o."orderNo" AS "orderNo"
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      LEFT JOIN "User" u ON u."id" = i."cancelledById"
      WHERE i."status" = 'CANCELLED' AND ${scope}
      ORDER BY i."cancelledAt" DESC LIMIT 100`;

    return {
      items: items.map((r) => ({
        menuItemId: r.menuItemId as string,
        name: r.name as string,
        variant: (r.variant as string) ?? null,
        category: (r.category as string) ?? null,
        quantity: num(r.quantity),
        total: num(r.total),
        net: num(r.net),
      })),
      categories: [...categories.values()].sort((a, b) => b.total - a.total),
      cancelled: cancelled.map((r) => ({ ...r, quantity: num(r.quantity) })),
    };
  }

  /** GST summary for the return, plus the invoice register. */
  async tax(user: AuthUser, range: Range) {
    const scope = await this.scope(user, range, 'inv');

    const rates = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT t."taxName" AS name, t."rate" AS rate, sum(t."taxableAmount") AS taxable, sum(t."taxAmount") AS amount
      FROM "InvoiceTaxLine" t JOIN "Invoice" inv ON inv."id" = t."invoiceId"
      WHERE inv."status" = 'ISSUED' AND ${scope}
      GROUP BY t."taxName", t."rate" ORDER BY t."rate", t."taxName"`;

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        outletId: range.outletId ?? (user.outletIds ? { in: user.outletIds } : undefined),
        businessDate: { gte: new Date(range.from), lte: new Date(range.to) },
      },
      orderBy: { issuedAt: 'asc' },
      select: {
        id: true,
        invoiceNo: true,
        issuedAt: true,
        status: true,
        customerName: true,
        customerGstin: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        grandTotal: true,
        cancelReason: true,
        orderId: true,
      },
    });

    return {
      rates: rates.map((r) => ({
        name: r.name as string,
        rate: num(r.rate),
        taxable: num(r.taxable),
        amount: num(r.amount),
      })),
      invoices,
    };
  }

  /** Builds the WHERE for tenant, outlet access and date range. */
  private async scope(user: AuthUser, range: Range, alias: 'o' | 'inv' = 'o') {
    if (range.from > range.to) throw new BadRequestException('Start date is after end date');
    const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
    if (days > 366) throw new BadRequestException('Pick a range of a year or less');

    if (range.outletId) await this.business.outletFor(user, range.outletId);
    const table = Prisma.raw(`"${alias}"`);

    const outlet = range.outletId
      ? Prisma.sql`AND ${table}."outletId" = ${range.outletId}::uuid`
      : user.outletIds
        ? user.outletIds.length
          ? Prisma.sql`AND ${table}."outletId" IN (${Prisma.join(user.outletIds.map((id) => Prisma.sql`${id}::uuid`))})`
          : Prisma.sql`AND false`
        : Prisma.empty;

    return Prisma.sql`${table}."tenantId" = ${user.tenantId}::uuid ${outlet}
      AND ${table}."businessDate" BETWEEN ${range.from}::date AND ${range.to}::date`;
  }
}
