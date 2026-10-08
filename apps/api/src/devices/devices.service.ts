import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/decorators';
import { ClientMeta, SessionsService } from '../auth/sessions.service';
import { BusinessService } from '../business/business.service';
import { canAccessOutlet } from '../common/access';
import { randomToken, sha256 } from '../common/crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_PIN_FAILURES = 5;
const LOCK_MINUTES = 5;

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
    private sessions: SessionsService,
    private audit: AuditService,
  ) {}

  async list(user: AuthUser, outletId: string) {
    await this.business.outletFor(user, outletId);
    return this.prisma.device.findMany({
      where: { outletId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, code: true, lastSeenAt: true, createdAt: true },
    });
  }

  /** Turns the current browser into a shared till for this outlet. */
  async register(user: AuthUser, outletId: string, name: string) {
    await this.business.outletFor(user, outletId);
    const count = await this.prisma.device.count({ where: { outletId } });
    const token = randomToken();

    const device = await this.prisma.device.create({
      data: {
        tenantId: user.tenantId,
        outletId,
        name,
        code: `D${count + 1}`,
        tokenHash: sha256(token),
      },
    });
    await this.audit.log(user, {
      action: 'device.register',
      entityType: 'Device',
      entityId: device.id,
      outletId,
      after: { name },
    });
    return { device, token };
  }

  async revoke(user: AuthUser, id: string) {
    const device = await this.prisma.device.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!device || !canAccessOutlet(user, device.outletId))
      throw new NotFoundException('Device not found');

    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id }, data: { status: 'REVOKED' } }),
      this.prisma.session.updateMany({
        where: { deviceId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log(user, {
      action: 'device.revoke',
      entityType: 'Device',
      entityId: id,
      outletId: device.outletId,
    });
  }

  async fromToken(token: string | undefined) {
    if (!token) return null;
    const device = await this.prisma.device.findUnique({
      where: { tokenHash: sha256(token) },
      include: { outlet: { include: { tenant: true } } },
    });
    if (!device || device.status !== 'ACTIVE' || device.outlet.deletedAt || !device.outlet.isActive)
      return null;
    if (['SUSPENDED', 'CANCELLED'].includes(device.outlet.tenant.status)) return null;
    return device;
  }

  /** Staff who can unlock this till with a PIN. */
  async lockScreen(token: string | undefined) {
    const device = await this.fromToken(token);
    if (!device) throw new UnauthorizedException('This device is not set up');

    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

    const staff = await this.prisma.user.findMany({
      where: {
        tenantId: device.tenantId,
        deletedAt: null,
        status: 'ACTIVE',
        pinHash: { not: null },
        OR: [
          { isOwner: true },
          { allOutlets: true },
          { outlets: { some: { outletId: device.outletId } } },
        ],
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: { select: { name: true } } },
    });

    return {
      device: { id: device.id, name: device.name, code: device.code },
      outlet: { id: device.outlet.id, name: device.outlet.name },
      business: { name: device.outlet.tenant.name },
      staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role.name })),
    };
  }

  async pinLogin(token: string | undefined, userId: string, pin: string, meta: ClientMeta) {
    const device = await this.fromToken(token);
    if (!device) throw new UnauthorizedException('This device is not set up');

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: device.tenantId, deletedAt: null, status: 'ACTIVE' },
      include: { outlets: { select: { outletId: true } } },
    });
    const allowed =
      user &&
      (user.isOwner || user.allOutlets || user.outlets.some((o) => o.outletId === device.outletId));
    if (!user || !allowed || !user.pinHash) throw new UnauthorizedException('Wrong PIN');

    if (user.pinLockedAt && Date.now() - user.pinLockedAt.getTime() < LOCK_MINUTES * 60_000) {
      throw new UnauthorizedException(`Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`);
    }

    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      const failures = user.pinFailures + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data:
          failures >= MAX_PIN_FAILURES
            ? { pinFailures: 0, pinLockedAt: new Date() }
            : { pinFailures: failures },
      });
      throw new UnauthorizedException('Wrong PIN');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { pinFailures: 0, pinLockedAt: null },
    });
    const session = await this.sessions.create(user, meta, device.id, 1);
    return { ...session, outletId: device.outletId };
  }

  /**
   * The till this session is on, and the last numbers it used, so it can keep
   * counting offline without clashing with what the server already has.
   */
  async numbering(user: AuthUser, date: string, fy: string) {
    if (!user.deviceId) return null;
    const device = await this.prisma.device.findUnique({
      where: { id: user.deviceId },
      include: { outlet: { select: { id: true, code: true } } },
    });
    if (!device) return null;

    const orders = await this.prisma.order.findMany({
      where: {
        outletId: device.outletId,
        businessDate: new Date(date),
        orderNo: { startsWith: `${device.code}-` },
      },
      select: { orderNo: true },
    });
    const invoicePrefix = `${device.outlet.code}/${fy.slice(2)}/${device.code}-`;
    const invoices = await this.prisma.invoice.findMany({
      where: { outletId: device.outletId, invoiceNo: { startsWith: invoicePrefix } },
      select: { invoiceNo: true },
    });
    const last = (values: string[], prefix: string) =>
      Math.max(0, ...values.map((v) => Number(v.slice(prefix.length)) || 0));

    return {
      id: device.id,
      code: device.code,
      outletId: device.outletId,
      outletCode: device.outlet.code,
      lastOrder: last(
        orders.map((o) => o.orderNo),
        `${device.code}-`,
      ),
      lastInvoice: last(
        invoices.map((i) => i.invoiceNo),
        invoicePrefix,
      ),
    };
  }
}
