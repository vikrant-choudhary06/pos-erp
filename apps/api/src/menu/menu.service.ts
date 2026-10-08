import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryDto, CreateItemDto, ModifierGroupDto, UpdateItemDto, VariantDto } from './dto';

function checkLimits(group: { minSelect: number; maxSelect: number }, options: number) {
  if (group.minSelect > group.maxSelect) {
    throw new BadRequestException('Minimum is more than the maximum');
  }
  if (!options) throw new BadRequestException('Add at least one option');
  if (group.minSelect > options) throw new BadRequestException('Minimum is more than the options');
}

const itemInclude = {
  category: { select: { id: true, name: true } },
  taxGroup: { select: { id: true, name: true } },
  variants: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, price: true },
  },
  modifierGroups: { select: { modifierGroupId: true } },
} satisfies Prisma.MenuItemInclude;

@Injectable()
export class MenuService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  listCategories(tenantId: string) {
    return this.prisma.menuCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
  }

  async createCategory(tenantId: string, input: CategoryDto) {
    if (input.parentId) await this.findCategory(tenantId, input.parentId);

    const sortOrder =
      input.sortOrder ??
      (await this.prisma.menuCategory.count({ where: { tenantId, deletedAt: null } }));

    return this.prisma.menuCategory.create({ data: { ...input, sortOrder, tenantId } });
  }

  async updateCategory(tenantId: string, id: string, input: Partial<CategoryDto>) {
    await this.findCategory(tenantId, id);
    if (input.parentId === id) throw new BadRequestException("A category can't be its own parent");
    if (input.parentId) await this.findCategory(tenantId, input.parentId);

    return this.prisma.menuCategory.update({ where: { id }, data: input });
  }

  async removeCategory(tenantId: string, id: string) {
    await this.findCategory(tenantId, id);

    const items = await this.prisma.menuItem.count({ where: { categoryId: id, deletedAt: null } });
    if (items) throw new BadRequestException(`Move or delete the ${items} items in it first`);

    await this.prisma.menuCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async reorderCategories(tenantId: string, ids: string[]) {
    const owned = await this.prisma.menuCategory.count({
      where: { tenantId, id: { in: ids }, deletedAt: null },
    });
    if (owned !== ids.length) throw new BadRequestException('Unknown category');

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  }

  listItems(tenantId: string, filter: { categoryId?: string; search?: string }) {
    return this.prisma.menuItem.findMany({
      where: {
        tenantId,
        deletedAt: null,
        categoryId: filter.categoryId,
        ...(filter.search && {
          OR: [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { shortCode: { startsWith: filter.search.toUpperCase() } },
          ],
        }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: itemInclude,
    });
  }

  async createItem(
    tenantId: string,
    { variants = [], modifierGroupIds = [], ...input }: CreateItemDto,
  ) {
    await this.findCategory(tenantId, input.categoryId);
    if (input.taxGroupId) await this.findTaxGroup(tenantId, input.taxGroupId);
    await this.checkModifierGroups(tenantId, modifierGroupIds);

    return this.prisma.menuItem.create({
      data: {
        ...input,
        tenantId,
        modifierGroups: {
          create: modifierGroupIds.map((modifierGroupId, i) => ({
            tenantId,
            modifierGroupId,
            sortOrder: i,
          })),
        },
        hasVariants: variants.length > 0,
        variants: {
          create: variants.map((v, i) => ({
            tenantId,
            name: v.name,
            price: v.price,
            sortOrder: i,
          })),
        },
      },
      include: itemInclude,
    });
  }

  async updateItem(
    user: AuthUser,
    id: string,
    { variants, modifierGroupIds, ...input }: UpdateItemDto,
  ) {
    const tenantId = user.tenantId;
    const before = await this.prisma.menuItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { variants: { where: { isActive: true }, select: { name: true, price: true } } },
    });
    if (!before) throw new NotFoundException('Item not found');
    if (input.categoryId) await this.findCategory(tenantId, input.categoryId);
    if (input.taxGroupId) await this.findTaxGroup(tenantId, input.taxGroupId);
    if (modifierGroupIds) await this.checkModifierGroups(tenantId, modifierGroupIds);

    const item = await this.prisma.$transaction(async (tx) => {
      if (variants) await this.syncVariants(tx, tenantId, id, variants);
      if (modifierGroupIds) {
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
        await tx.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((modifierGroupId, i) => ({
            tenantId,
            menuItemId: id,
            modifierGroupId,
            sortOrder: i,
          })),
        });
      }

      return tx.menuItem.update({
        where: { id },
        data: { ...input, ...(variants && { hasVariants: variants.length > 0 }) },
        include: itemInclude,
      });
    });

    const prices = (row: {
      basePrice: Prisma.Decimal;
      variants: { name: string; price: Prisma.Decimal }[];
    }) =>
      JSON.stringify([Number(row.basePrice), row.variants.map((v) => [v.name, Number(v.price)])]);
    if (prices(before) !== prices(item)) {
      await this.audit.log(user, {
        action: 'menu.price_change',
        entityType: 'MenuItem',
        entityId: id,
        before: { name: before.name, basePrice: before.basePrice, variants: before.variants },
        after: { name: item.name, basePrice: item.basePrice, variants: item.variants },
      });
    }
    return item;
  }

  listModifierGroups(tenantId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { items: true } },
      },
    });
  }

  createModifierGroup(tenantId: string, { options, ...input }: ModifierGroupDto) {
    checkLimits(input, options.length);
    return this.prisma.modifierGroup.create({
      data: {
        ...input,
        tenantId,
        options: {
          create: options.map((o, i) => ({ tenantId, name: o.name, price: o.price, sortOrder: i })),
        },
      },
      include: { options: true },
    });
  }

  async updateModifierGroup(tenantId: string, id: string, { options, ...input }: ModifierGroupDto) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!group) throw new NotFoundException('Add-on group not found');
    checkLimits(input, options.length);

    return this.prisma.$transaction(async (tx) => {
      // options that disappeared are hidden, old orders still point at them
      const keep = options.filter((o) => o.id).map((o) => o.id!);
      await tx.modifierOption.updateMany({
        where: { groupId: id, id: { notIn: keep } },
        data: { isActive: false },
      });
      for (const [i, o] of options.entries()) {
        if (o.id) {
          await tx.modifierOption.update({
            where: { id: o.id, groupId: id },
            data: { name: o.name, price: o.price, sortOrder: i, isActive: true },
          });
        } else {
          await tx.modifierOption.create({
            data: { tenantId, groupId: id, name: o.name, price: o.price, sortOrder: i },
          });
        }
      }
      return tx.modifierGroup.update({ where: { id }, data: input, include: { options: true } });
    });
  }

  async removeModifierGroup(tenantId: string, id: string) {
    const group = await this.prisma.modifierGroup.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Add-on group not found');
    await this.prisma.$transaction([
      this.prisma.menuItemModifierGroup.deleteMany({ where: { modifierGroupId: id } }),
      this.prisma.modifierGroup.update({ where: { id }, data: { isActive: false } }),
    ]);
  }

  private async checkModifierGroups(tenantId: string, ids: string[]) {
    if (!ids.length) return;
    const found = await this.prisma.modifierGroup.count({
      where: { id: { in: ids }, tenantId, isActive: true },
    });
    if (found !== new Set(ids).size) throw new BadRequestException('Unknown add-on group');
  }

  async removeItem(tenantId: string, id: string) {
    await this.findItem(tenantId, id);
    await this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), shortCode: null },
    });
  }

  listTaxGroups(tenantId: string) {
    return this.prisma.taxGroup.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // Variants that disappeared from the form are deactivated, not deleted,
  // because old orders may still point at them.
  private async syncVariants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    menuItemId: string,
    variants: VariantDto[],
  ) {
    const keep = variants.filter((v) => v.id).map((v) => v.id!);

    await tx.menuItemVariant.updateMany({
      where: { menuItemId, id: { notIn: keep } },
      data: { isActive: false },
    });

    for (const [i, v] of variants.entries()) {
      if (v.id) {
        await tx.menuItemVariant.update({
          where: { id: v.id, menuItemId },
          data: { name: v.name, price: v.price, sortOrder: i },
        });
      } else {
        await tx.menuItemVariant.create({
          data: { tenantId, menuItemId, name: v.name, price: v.price, sortOrder: i },
        });
      }
    }
  }

  private async findCategory(tenantId: string, id: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async findItem(tenantId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  private async findTaxGroup(tenantId: string, id: string) {
    const group = await this.prisma.taxGroup.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Tax group not found');
    return group;
  }
}
