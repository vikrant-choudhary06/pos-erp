import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

type Entry = {
  action: string;
  entityType: string;
  entityId?: string;
  outletId?: string;
  before?: unknown;
  after?: unknown;
};

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Record who did what. Pass a transaction client to keep the entry in the
   * same transaction as the change itself.
   */
  async log(user: AuthUser, entry: Entry, db: Db = this.prisma) {
    try {
      await db.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          outletId: entry.outletId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: toJson(entry.before),
          after: toJson(entry.after),
        },
      });
    } catch (err) {
      // never fail the real action because of the audit trail
      if (db !== this.prisma) throw err;
      this.logger.error(`Audit log failed for ${entry.action}`, err as Error);
    }
  }

  async list(
    tenantId: string,
    filter: { action?: string; userId?: string; before?: string; limit?: number },
  ) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        action: filter.action ? { startsWith: filter.action } : undefined,
        userId: filter.userId,
        createdAt: filter.before ? { lt: new Date(filter.before) } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
    });

    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, employeeCode: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return rows.map((row) => ({
      ...row,
      user: row.userId ? (byId.get(row.userId) ?? null) : null,
    }));
  }
}

function toJson(value: unknown) {
  if (value === undefined) return undefined;
  // Decimal and Date survive a JSON round trip as strings
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
