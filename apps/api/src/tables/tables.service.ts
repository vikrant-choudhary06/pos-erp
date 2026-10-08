import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { canAccessOutlet } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { AreaDto, BulkTablesDto, TableDto } from './dto';

@Injectable()
export class TablesService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
  ) {}

  async floor(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);

    const [areas, tables] = await Promise.all([
      this.prisma.floorArea.findMany({
        where: { outletId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.diningTable.findMany({
        where: { outletId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return { areas, tables };
  }

  async createArea(user: AuthUser, outletId: string, input: AreaDto) {
    await this.business.outletFor(user, outletId);
    return this.prisma.floorArea.create({ data: { ...input, tenantId: user.tenantId, outletId } });
  }

  async updateArea(user: AuthUser, id: string, input: Partial<AreaDto>) {
    await this.findArea(user, id);
    return this.prisma.floorArea.update({ where: { id }, data: input });
  }

  async removeArea(user: AuthUser, id: string) {
    await this.findArea(user, id);
    await this.prisma.$transaction([
      this.prisma.diningTable.updateMany({ where: { areaId: id }, data: { areaId: null } }),
      this.prisma.floorArea.delete({ where: { id } }),
    ]);
  }

  async createTable(user: AuthUser, outletId: string, input: TableDto) {
    await this.business.outletFor(user, outletId);
    if (input.areaId) await this.findArea(user, input.areaId, outletId);

    const sortOrder = await this.prisma.diningTable.count({ where: { outletId } });
    return this.prisma.diningTable.create({
      data: { ...input, tenantId: user.tenantId, outletId, sortOrder },
    });
  }

  async createMany(user: AuthUser, outletId: string, input: BulkTablesDto) {
    await this.business.outletFor(user, outletId);
    if (input.areaId) await this.findArea(user, input.areaId, outletId);

    const names = Array.from(
      { length: input.count },
      (_, i) => `${input.prefix}${input.start + i}`,
    );
    const clash = await this.prisma.diningTable.findMany({
      where: { outletId, name: { in: names } },
      select: { name: true },
    });
    if (clash.length) {
      throw new BadRequestException(`Already exists: ${clash.map((t) => t.name).join(', ')}`);
    }

    const offset = await this.prisma.diningTable.count({ where: { outletId } });
    await this.prisma.diningTable.createMany({
      data: names.map((name, i) => ({
        tenantId: user.tenantId,
        outletId,
        name,
        areaId: input.areaId,
        capacity: input.capacity ?? 4,
        sortOrder: offset + i,
      })),
    });
    return { created: names.length };
  }

  async updateTable(user: AuthUser, id: string, input: Partial<TableDto>) {
    const table = await this.findTable(user, id);
    if (input.areaId) await this.findArea(user, input.areaId, table.outletId);
    return this.prisma.diningTable.update({ where: { id }, data: input });
  }

  async removeTable(user: AuthUser, id: string) {
    await this.findTable(user, id);

    const orders = await this.prisma.order.count({ where: { tableId: id } });
    if (orders) {
      // keep history intact, just hide it from the floor
      await this.prisma.diningTable.update({ where: { id }, data: { isActive: false } });
      return;
    }
    await this.prisma.diningTable.delete({ where: { id } });
  }

  private async findArea(user: AuthUser, id: string, outletId?: string) {
    const area = await this.prisma.floorArea.findFirst({
      where: { id, tenantId: user.tenantId, outletId },
    });
    if (!area || !canAccessOutlet(user, area.outletId))
      throw new NotFoundException('Area not found');
    return area;
  }

  private async findTable(user: AuthUser, id: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!table || !canAccessOutlet(user, table.outletId)) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }
}
