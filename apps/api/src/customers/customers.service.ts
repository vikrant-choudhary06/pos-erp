import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

export type CustomerInput = {
  phone: string;
  name?: string;
  email?: string;
  birthday?: string;
  anniversary?: string;
  gstin?: string;
  address?: string;
  notes?: string;
};

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(tenantId: string, q: { search?: string; dues?: boolean; page: number }) {
    const search = q.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(q.dues && { creditBalance: { gt: 0 } }),
      ...(search && {
        OR: [{ phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' } }],
      }),
    };
    const pageSize = 30;
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { rows, total, pageSize };
  }

  lookup(tenantId: string, phone: string) {
    return this.prisma.customer.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
  }

  async get(tenantId: string, id: string) {
    const customer = await this.find(tenantId, id);
    const orders = await this.prisma.order.findMany({
      where: { customerId: id },
      orderBy: { openedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        orderNo: true,
        type: true,
        status: true,
        grandTotal: true,
        openedAt: true,
        outletId: true,
      },
    });
    return { ...customer, orders };
  }

  create(tenantId: string, input: CustomerInput) {
    return this.prisma.customer.create({
      data: { ...this.toData(input), phone: input.phone, tenantId },
    });
  }

  async update(tenantId: string, id: string, input: Partial<CustomerInput>) {
    await this.find(tenantId, id);
    return this.prisma.customer.update({ where: { id }, data: this.toData(input) });
  }

  /** Customer pays off what they owe on credit. */
  async settleDues(
    user: AuthUser,
    id: string,
    input: { amount: number; method: PaymentMethod; reference?: string },
  ) {
    const customer = await this.find(user.tenantId, id);
    const owed = Number(customer.creditBalance);
    if (input.amount > owed) throw new BadRequestException(`They only owe ₹${owed}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.customer.update({
        where: { id },
        data: { creditBalance: { decrement: input.amount } },
      });
      await this.audit.log(
        user,
        {
          action: 'customer.dues_settled',
          entityType: 'Customer',
          entityId: id,
          before: { creditBalance: owed },
          after: { ...input, creditBalance: row.creditBalance },
        },
        tx,
      );
      return row;
    });
    return updated;
  }

  private toData(input: Partial<CustomerInput>) {
    return {
      ...input,
      birthday: input.birthday ? new Date(input.birthday) : undefined,
      anniversary: input.anniversary ? new Date(input.anniversary) : undefined,
    };
  }

  private async find(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
