import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustmentDto, InventoryItemDto, RecipeDto, UpdateInventoryItemDto } from './dto';
import { StockService } from './stock.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private stock: StockService,
    private audit: AuditService,
  ) {}

  listItems(tenantId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  createItem(tenantId: string, input: InventoryItemDto) {
    return this.prisma.inventoryItem.create({ data: { ...input, tenantId } });
  }

  async updateItem(tenantId: string, id: string, input: UpdateInventoryItemDto) {
    const item = await this.findItem(tenantId, id);
    if (input.baseUnit && input.baseUnit !== item.baseUnit) {
      const moved = await this.prisma.stockMovement.count({ where: { inventoryItemId: id } });
      if (moved)
        throw new BadRequestException("The unit can't change once stock has been recorded");
    }
    return this.prisma.inventoryItem.update({ where: { id }, data: input });
  }

  async removeItem(tenantId: string, id: string) {
    await this.findItem(tenantId, id);
    const inRecipes = await this.prisma.recipeIngredient.count({ where: { inventoryItemId: id } });
    if (inRecipes)
      throw new BadRequestException(`Used in ${inRecipes} recipes. Remove it from them first.`);
    await this.prisma.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Every item with its balance at one outlet. */
  async stockLevels(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { stocks: { where: { outletId } } },
    });

    return items.map(({ stocks, ...item }) => {
      const stock = stocks[0];
      const quantity = Number(stock?.quantity ?? 0);
      const reorderLevel = Number(stock?.reorderLevel ?? item.reorderLevel ?? 0);
      const avgCost = Number(stock?.avgCost ?? 0);
      return {
        ...item,
        quantity,
        avgCost,
        value: Math.round(quantity * avgCost * 100) / 100,
        reorderLevel,
        low: reorderLevel > 0 && quantity <= reorderLevel,
      };
    });
  }

  async adjust(user: AuthUser, input: AdjustmentDto) {
    await this.business.outletFor(user, input.outletId);
    const item = await this.findItem(user.tenantId, input.inventoryItemId);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.outletStock.findUnique({
        where: { outletId_inventoryItemId: { outletId: input.outletId, inventoryItemId: item.id } },
      });
      const onHand = Number(current?.quantity ?? 0);

      const change =
        input.kind === 'OPENING'
          ? input.quantity
          : input.kind === 'WASTAGE'
            ? -input.quantity
            : input.quantity - onHand;
      if (change === 0) return;

      await this.stock.move(tx, {
        tenantId: user.tenantId,
        outletId: input.outletId,
        inventoryItemId: item.id,
        type:
          input.kind === 'OPENING'
            ? 'OPENING'
            : input.kind === 'WASTAGE'
              ? 'WASTAGE'
              : 'ADJUSTMENT',
        quantity: change,
        unitCost: input.kind === 'OPENING' ? input.unitCost : undefined,
        referenceType: 'MANUAL',
        reason: input.reason,
        userId: user.userId,
      });

      await this.audit.log(
        user,
        {
          action: `stock.${input.kind.toLowerCase()}`,
          entityType: 'InventoryItem',
          entityId: item.id,
          outletId: input.outletId,
          before: { quantity: onHand },
          after: { quantity: onHand + change, reason: input.reason },
        },
        tx,
      );
    });

    return this.stockLevels(user, input.outletId).then((rows) =>
      rows.find((r) => r.id === item.id),
    );
  }

  async movements(user: AuthUser, outletId: string, inventoryItemId?: string) {
    await this.business.outletFor(user, outletId);
    const rows = await this.prisma.stockMovement.findMany({
      where: { outletId, inventoryItemId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { inventoryItem: { select: { name: true, baseUnit: true } } },
    });
    return rows;
  }

  async getRecipes(tenantId: string, menuItemId: string) {
    await this.findMenuItem(tenantId, menuItemId);
    return this.prisma.recipe.findMany({
      where: { menuItemId },
      include: {
        ingredients: {
          include: { inventoryItem: { select: { id: true, name: true, baseUnit: true } } },
        },
      },
    });
  }

  async saveRecipe(user: AuthUser, menuItemId: string, input: RecipeDto) {
    const menuItem = await this.findMenuItem(user.tenantId, menuItemId);
    const variantId = input.variantId ?? null;
    if (variantId && !menuItem.variants.some((v) => v.id === variantId)) {
      throw new BadRequestException('Unknown portion');
    }

    const ids = input.ingredients.map((i) => i.inventoryItemId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Each ingredient only once');
    const found = await this.prisma.inventoryItem.count({
      where: { id: { in: ids }, tenantId: user.tenantId, deletedAt: null },
    });
    if (found !== ids.length) throw new BadRequestException('Unknown ingredient');

    await this.prisma.$transaction(async (tx) => {
      // nullable column in a unique index, so find it instead of upserting
      const existing = await tx.recipe.findFirst({ where: { menuItemId, variantId } });
      if (!input.ingredients.length) {
        if (existing) await tx.recipe.delete({ where: { id: existing.id } });
        return;
      }

      const recipe =
        existing ??
        (await tx.recipe.create({ data: { tenantId: user.tenantId, menuItemId, variantId } }));
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await tx.recipeIngredient.createMany({
        data: input.ingredients.map((i) => ({
          tenantId: user.tenantId,
          recipeId: recipe.id,
          inventoryItemId: i.inventoryItemId,
          quantity: i.quantity,
        })),
      });
    });

    return this.getRecipes(user.tenantId, menuItemId);
  }

  private async findItem(tenantId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Stock item not found');
    return item;
  }

  private async findMenuItem(tenantId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { variants: { where: { isActive: true } } },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }
}
