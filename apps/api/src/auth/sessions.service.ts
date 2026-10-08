import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken, sha256 } from '../common/crypto';
import { AuthUser } from './decorators';

const SESSION_DAYS = 30;
const TOUCH_AFTER_MS = 60 * 60 * 1000;

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  /** Shared tills pass their device id and get a shorter session. */
  async create(
    user: { id: string; tenantId: string },
    meta: ClientMeta,
    deviceId?: string,
    days = SESSION_DAYS,
  ) {
    const token = randomToken();
    const expiresAt = daysFromNow(days);

    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          deviceId,
          tokenHash: sha256(token),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 300),
          expiresAt,
        },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    return { token, expiresAt };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: { include: { role: true, tenant: true, outlets: { select: { outletId: true } } } },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

    const { user } = session;
    if (user.status !== 'ACTIVE' || user.deletedAt) return null;
    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED') return null;

    // sliding expiry, but don't write on every request
    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          // PIN sessions on shared tills don't slide, they end with the day
          expiresAt: session.deviceId ? undefined : daysFromNow(SESSION_DAYS),
        },
      });
    }

    return {
      sessionId: session.id,
      userId: user.id,
      tenantId: user.tenantId,
      isOwner: user.isOwner,
      permissions: user.role.permissions,
      outletIds: user.isOwner || user.allOutlets ? null : user.outlets.map((o) => o.outletId),
    };
  }

  revoke(sessionId: string) {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForUser(userId: string) {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
