import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { canAccessOutlet } from '../common/access';
import { nextNumber } from '../common/counters';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

export type VendorInput = {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
};

export type PurchaseInput = {
  outletId: string;
  vendorId: string;
  vendorInvoiceNo?: string;
  vendorInvoiceDate?: string;
  notes?: string;
  lines: { inventoryItemId: string; quantity: number; unitPrice: number; taxRate?: number }[];
};

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private stock: StockService,
    private audit: AuditService,
  ) {}

  listVendors(tenantId: string) {
    return this.prisma.vendor.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { receipts: true } } },
    });
  }

  createVendor(tenantId: string, input: VendorInput) {
    return this.prisma.vendor.create({ data: { ...input, tenantId } });
  }

  async updateVendor(
    tenantId: string,
    id: string,
    input: Partial<VendorInput> & { isActive?: boolean },
  ) {
    await this.findVendor(tenantId, id);
    return this.prisma.vendor.update({ where: { id }, data: input });
  }

  async payVendor(
    user: AuthUser,
    id: string,
    input: { amount: number; method: PaymentMethod; reference?: string; notes?: string },
  ) {
    const vendor = await this.findVendor(user.tenantId, id);
    await this.prisma.$transaction([
      this.prisma.vendorPayment.create({
        data: { ...input, tenantId: user.tenantId, vendorId: id, createdById: user.userId },
      }),
      this.prisma.vendor.update({
        where: { id },
        data: { balanceDue: { decrement: input.amount } },
      }),
    ]);
    await this.audit.log(user, {
      action: 'vendor.payment',
      entityType: 'Vendor',
      entityId: id,
      before: { balanceDue: vendor.balanceDue },
      after: input,
    });
    return this.findVendor(user.tenantId, id);
  }

  async vendorLedger(tenantId: string, id: string) {
    const vendor = await this.findVendor(tenantId, id);
    const [receipts, payments] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where: { vendorId: id },
        orderBy: { receivedAt: 'desc' },
        take: 100,
        select: { id: true, grnNo: true, vendorInvoiceNo: true, receivedAt: true, total: true },
      }),
      this.prisma.vendorPayment.findMany({
        where: { vendorId: id },
        orderBy: { paidAt: 'desc' },
        take: 100,
      }),
    ]);
    return { vendor, receipts, payments };
  }

  async listPurchases(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);
    return this.prisma.goodsReceipt.findMany({
      where: { outletId },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      include: { vendor: { select: { name: true } }, _count: { select: { lines: true } } },
    });
  }

  async getPurchase(user: AuthUser, id: string) {
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        vendor: { select: { id: true, name: true, gstin: true } },
        lines: {
          include: {
            inventoryItem: { select: { name: true, baseUnit: true, purchaseUnit: true } },
          },
        },
      },
    });
    if (!receipt || !canAccessOutlet(user, receipt.outletId))
      throw new NotFoundException('Purchase not found');
    return receipt;
  }

  /** Goods received: adds stock, updates average cost, and what we owe the vendor. */
  async createPurchase(user: AuthUser, input: PurchaseInput) {
    await this.business.outletFor(user, input.outletId);
    await this.findVendor(user.tenantId, input.vendorId);

    const ids = input.lines.map((l) => l.inventoryItemId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids }, tenantId: user.tenantId, deletedAt: null },
    });
    if (items.length !== new Set(ids).size) throw new BadRequestException('Unknown stock item');

    const lines = input.lines.map((line) => {
      const net = round2(line.quantity * line.unitPrice);
      const tax = round2((net * (line.taxRate ?? 0)) / 100);
      return { ...line, net, tax, lineTotal: round2(net + tax) };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.net, 0));
    const taxTotal = round2(lines.reduce((s, l) => s + l.tax, 0));
    const total = round2(subtotal + taxTotal);

    const receipt = await this.prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, input.outletId, 'grn');
      const receipt = await tx.goodsReceipt.create({
        data: {
          tenantId: user.tenantId,
          outletId: input.outletId,
          vendorId: input.vendorId,
          grnNo: `GRN-${String(number).padStart(4, '0')}`,
          vendorInvoiceNo: input.vendorInvoiceNo,
          vendorInvoiceDate: input.vendorInvoiceDate
            ? new Date(input.vendorInvoiceDate)
            : undefined,
          subtotal,
          taxTotal,
          total,
          notes: input.notes,
          receivedById: user.userId,
          lines: {
            create: lines.map((l) => ({
              tenantId: user.tenantId,
              inventoryItemId: l.inventoryItemId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate ?? 0,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      for (const line of lines) {
        const item = items.find((i) => i.id === line.inventoryItemId)!;
        const factor = Number(item.purchaseUnitFactor) || 1;
        await this.stock.move(tx, {
          tenantId: user.tenantId,
          outletId: input.outletId,
          inventoryItemId: item.id,
          type: 'PURCHASE',
          quantity: line.quantity * factor,
          unitCost: line.unitPrice / factor,
          referenceType: 'GRN',
          referenceId: receipt.id,
          userId: user.userId,
        });
      }

      await tx.vendor.update({
        where: { id: input.vendorId },
        data: { balanceDue: { increment: total } },
      });
      return receipt;
    });

    return this.getPurchase(user, receipt.id);
  }

  private async findVendor(tenantId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, tenantId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
