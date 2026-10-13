import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { INDIAN_STATES, outletSettings } from '@pos/shared';
import { AuthUser } from '../auth/decorators';
import { canAccessOutlet } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOutletDto, UpdateBusinessDto, UpdateOutletDto } from './dto';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  getBusiness(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        legalName: true,
        businessCode: true,
        businessType: true,
        email: true,
        phone: true,
        gstin: true,
        status: true,
        createdAt: true,
      },
    });
  }

  updateBusiness(tenantId: string, data: UpdateBusinessDto) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data });
  }

  listOutlets(user: AuthUser) {
    return this.prisma.outlet.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(user.outletIds && { id: { in: user.outletIds } }),
      },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { tables: true, devices: true } } },
    });
  }

  createOutlet(tenantId: string, data: CreateOutletDto) {
    return this.prisma.outlet.create({
      data: { ...data, tenantId, state: stateName(data.stateCode) },
    });
  }

  async updateOutlet(user: AuthUser, id: string, { settings, ...data }: UpdateOutletDto) {
    const outlet = await this.outletFor(user, id);
    return this.prisma.outlet.update({
      where: { id },
      data: {
        ...data,
        ...(data.stateCode && { state: stateName(data.stateCode) }),
        // merge so older clients don't wipe settings they don't know about
        ...(settings && { settings: { ...outletSettings(outlet.settings), ...settings } }),
      },
    });
  }

  /** Outlet the user is allowed to work in, or a 403/404. */
  async outletFor(user: AuthUser, id: string) {
    if (!canAccessOutlet(user, id))
      throw new ForbiddenException("You don't have access to this outlet");
    return this.findOutlet(user.tenantId, id);
  }

  async findOutlet(tenantId: string, id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    return outlet;
  }
}

const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name;
