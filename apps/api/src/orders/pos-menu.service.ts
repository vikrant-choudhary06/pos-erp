import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { outletSettings } from '@pos/shared';

/** Everything the POS needs to show the menu for one outlet, in one call. */
@Injectable()
export class PosMenuService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private events: EventsService,
  ) {}

  async menu(user: AuthUser, outletId: string) {
    const outlet = await this.business.outletFor(user, outletId);

    const [categories, items, tables, areas] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.menuItem.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          variants: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, price: true },
          },
          taxGroup: { include: { components: { select: { name: true, rate: true } } } },
          outletSettings: { where: { outletId } },
          prices: {
            where: { outletId },
            select: { variantId: true, orderType: true, price: true },
          },
          modifierGroups: {
            orderBy: { sortOrder: 'asc' },
            include: {
              modifierGroup: {
                include: {
                  options: {
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                    select: { id: true, name: true, price: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.diningTable.findMany({
        where: { outletId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, capacity: true, areaId: true },
      }),
      this.prisma.floorArea.findMany({
        where: { outletId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
    ]);

    return {
      outlet: {
        id: outlet.id,
        name: outlet.name,
        code: outlet.code,
        priceIncludesTax: outlet.priceIncludesTax,
        settings: outletSettings(outlet.settings),
      },
      categories,
      areas,
      tables,
      items: items
        .filter((item) => item.outletSettings[0]?.isAvailable !== false)
        .map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          shortCode: item.shortCode,
          foodType: item.foodType,
          basePrice: item.basePrice,
          hasVariants: item.hasVariants,
          variants: item.variants,
          prices: item.prices,
          taxes: item.taxGroup?.components ?? [],
          outOfStock: item.outletSettings[0]?.isOutOfStock ?? false,
          modifierGroups: item.modifierGroups
            .filter((g) => g.modifierGroup.isActive && g.modifierGroup.options.length)
            .map(({ modifierGroup: g }) => ({
              id: g.id,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              options: g.options,
            })),
        })),
    };
  }

  async setOutOfStock(user: AuthUser, outletId: string, menuItemId: string, outOfStock: boolean) {
    await this.business.outletFor(user, outletId);
    await this.prisma.menuItem.findFirstOrThrow({
      where: { id: menuItemId, tenantId: user.tenantId },
    });

    await this.prisma.outletMenuItem.upsert({
      where: { outletId_menuItemId: { outletId, menuItemId } },
      create: { tenantId: user.tenantId, outletId, menuItemId, isOutOfStock: outOfStock },
      update: { isOutOfStock: outOfStock },
    });
    this.events.emit({ outletId, type: 'menu' });
  }
}
