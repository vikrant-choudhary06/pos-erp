import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SessionsService } from '../auth/sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto, RoleDto, UpdateStaffDto } from './dto';

const staffSelect = {
  id: true,
  employeeCode: true,
  name: true,
  email: true,
  phone: true,
  isOwner: true,
  allOutlets: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  passwordHash: true,
  pinHash: true,
  role: { select: { id: true, name: true } },
  outlets: { select: { outlet: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionsService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: staffSelect,
      orderBy: [{ isOwner: 'desc' }, { employeeCode: 'asc' }],
    });
    return rows.map(present);
  }

  async create(tenantId: string, input: CreateStaffDto) {
    await this.checkRole(tenantId, input.roleId);
    await this.checkOutlets(tenantId, input.outletIds);

    const data = {
      tenantId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      roleId: input.roleId,
      allOutlets: input.allOutlets ?? false,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
      pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null,
    };

    // Employee codes are sequential per business (E001, E002...). Retry if two
    // people get added at the same moment.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const user = await this.prisma.user.create({
          data: {
            ...data,
            employeeCode: await this.nextEmployeeCode(tenantId),
            outlets: input.allOutlets ? undefined : outletLinks(tenantId, input.outletIds),
          },
          select: staffSelect,
        });
        return present(user);
      } catch (err) {
        const codeClash =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.target).includes('employeeCode');
        if (!codeClash) throw err;
      }
    }
    throw new BadRequestException('Could not create staff, please try again');
  }

  async update(tenantId: string, id: string, input: UpdateStaffDto) {
    const user = await this.find(tenantId, id);

    if (user.isOwner && (input.roleId || input.status === 'INACTIVE')) {
      throw new BadRequestException("The owner's role and status can't be changed");
    }
    if (input.roleId) await this.checkRole(tenantId, input.roleId);
    if (input.outletIds) await this.checkOutlets(tenantId, input.outletIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.outletIds) {
        await tx.userOutlet.deleteMany({ where: { userId: id } });
      }

      return tx.user.update({
        where: { id },
        data: {
          name: input.name,
          phone: input.phone,
          email: input.email,
          roleId: input.roleId,
          status: input.status,
          allOutlets: input.allOutlets,
          passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
          pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : undefined,
          outlets: input.outletIds ? outletLinks(tenantId, input.outletIds) : undefined,
        },
        select: staffSelect,
      });
    });

    if (input.status === 'INACTIVE' || input.password) {
      await this.sessions.revokeAllForUser(id);
    }
    return present(updated);
  }

  async remove(tenantId: string, id: string) {
    const user = await this.find(tenantId, id);
    if (user.isOwner) throw new BadRequestException("The owner can't be removed");

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE', email: null },
    });
    await this.sessions.revokeAllForUser(id);
  }

  listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
    });
  }

  createRole(tenantId: string, input: RoleDto) {
    return this.prisma.role.create({ data: { ...input, tenantId } });
  }

  async updateRole(tenantId: string, id: string, input: RoleDto) {
    const role = await this.findRole(tenantId, id);
    if (role.name === 'Owner' && role.isSystem) {
      throw new BadRequestException("The Owner role can't be edited");
    }
    return this.prisma.role.update({ where: { id }, data: input });
  }

  async removeRole(tenantId: string, id: string) {
    const role = await this.findRole(tenantId, id);
    if (role.isSystem) throw new BadRequestException("Default roles can't be deleted");

    const inUse = await this.prisma.user.count({ where: { roleId: id, deletedAt: null } });
    if (inUse) throw new BadRequestException(`${inUse} staff still have this role`);

    await this.prisma.role.delete({ where: { id } });
  }

  private async find(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!user) throw new NotFoundException('Staff not found');
    return user;
  }

  private async findRole(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private async checkRole(tenantId: string, roleId: string) {
    const role = await this.findRole(tenantId, roleId);
    if (role.name === 'Owner' && role.isSystem) {
      throw new BadRequestException('There can only be one owner');
    }
  }

  private async checkOutlets(tenantId: string, ids: string[] = []) {
    if (!ids.length) return;
    const found = await this.prisma.outlet.count({
      where: { tenantId, id: { in: ids }, deletedAt: null },
    });
    if (found !== ids.length) throw new BadRequestException('Unknown outlet');
  }

  private async nextEmployeeCode(tenantId: string) {
    const count = await this.prisma.user.count({ where: { tenantId } });
    return `E${String(count + 1).padStart(3, '0')}`;
  }
}

function outletLinks(tenantId: string, ids: string[] = []) {
  return { create: ids.map((outletId) => ({ tenantId, outletId })) };
}

// never send hashes to the client
function present({ passwordHash, pinHash, outlets, ...user }: StaffRow) {
  return {
    ...user,
    hasPassword: Boolean(passwordHash),
    hasPin: Boolean(pinHash),
    outlets: outlets.map((o) => o.outlet),
  };
}
