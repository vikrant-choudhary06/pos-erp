import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';

type Move = {
  tenantId: string;
  outletId: string;
  inventoryItemId: string;
  type: StockMovementType;
  /** base units, positive = in, negative = out */
  quantity: number;
  /** per base unit; only used for stock coming in */
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  userId?: string;
};

/**
 * The only place that changes stock. Every change writes a ledger row and
 * updates the cached balance in OutletStock. Always call inside a transaction.
 */
@Injectable()
export class StockService {
  async move(tx: Prisma.TransactionClient, m: Move) {
    const current = await tx.outletStock.findUnique({
      where: {
        outletId_inventoryItemId: { outletId: m.outletId, inventoryItemId: m.inventoryItemId },
      },
    });
    const oldQty = Number(current?.quantity ?? 0);
    const oldAvg = Number(current?.avgCost ?? 0);
    const newQty = round3(oldQty + m.quantity);

    // weighted average cost, only moved by purchases / opening stock
    let avgCost = oldAvg;
    if (m.quantity > 0 && m.unitCost !== undefined) {
      const base = Math.max(oldQty, 0);
      avgCost =
        base + m.quantity > 0
          ? (base * oldAvg + m.quantity * m.unitCost) / (base + m.quantity)
          : m.unitCost;
    }

    await tx.outletStock.upsert({
      where: {
        outletId_inventoryItemId: { outletId: m.outletId, inventoryItemId: m.inventoryItemId },
      },
      create: {
        tenantId: m.tenantId,
        outletId: m.outletId,
        inventoryItemId: m.inventoryItemId,
        quantity: newQty,
        avgCost,
      },
      update: { quantity: newQty, avgCost },
    });

    await tx.stockMovement.create({
      data: {
        tenantId: m.tenantId,
        outletId: m.outletId,
        inventoryItemId: m.inventoryItemId,
        type: m.type,
        quantity: round3(m.quantity),
        unitCost: m.unitCost ?? avgCost,
        balanceAfter: newQty,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reason: m.reason,
        createdById: m.userId,
      },
    });
  }

  /**
   * Deduct ingredients for sold items (direction 1) or put them back when a
   * paid order is voided (direction -1). Items without a recipe are skipped.
   */
  async consumeForOrder(
    tx: Prisma.TransactionClient,
    order: { id: string; tenantId: string; outletId: string },
    items: { menuItemId: string; variantId: string | null; quantity: number }[],
    direction: 1 | -1,
    userId?: string,
  ) {
    if (!items.length) return;

    const recipes = await tx.recipe.findMany({
      where: { menuItemId: { in: items.map((i) => i.menuItemId) }, isActive: true },
      include: { ingredients: true },
    });
    if (!recipes.length) return;

    const usage = new Map<string, number>();
    for (const item of items) {
      const recipe =
        recipes.find((r) => r.menuItemId === item.menuItemId && r.variantId === item.variantId) ??
        recipes.find((r) => r.menuItemId === item.menuItemId && r.variantId === null);
      if (!recipe) continue;

      for (const ing of recipe.ingredients) {
        const qty = Number(ing.quantity) * item.quantity;
        usage.set(ing.inventoryItemId, (usage.get(ing.inventoryItemId) ?? 0) + qty);
      }
    }

    for (const [inventoryItemId, qty] of usage) {
      await this.move(tx, {
        tenantId: order.tenantId,
        outletId: order.outletId,
        inventoryItemId,
        type: direction === 1 ? 'SALE' : 'SALE_REVERSAL',
        quantity: -qty * direction,
        referenceType: 'ORDER',
        referenceId: order.id,
        userId,
      });
    }
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
