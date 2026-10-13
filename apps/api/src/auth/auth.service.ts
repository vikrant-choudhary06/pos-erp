import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomToken, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators';
import { OtpService } from './otp.service';
import { ClientMeta, SessionsService } from './sessions.service';

export const SIGNUP_TTL_MS = 30 * 60 * 1000;
const MAX_PASSWORD_FAILURES = 5;
const PASSWORD_LOCK_MS = 5 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private otp: OtpService,
    private sessions: SessionsService,
  ) {}

  sendCode(email: string) {
    return this.otp.send(email);
  }

  /**
   * Known email -> new session.
   * Unknown email -> a short-lived signup token used by onboarding.
   */
  async verifyCode(email: string, code: string, meta: ClientMeta) {
    const otpId = await this.otp.verify(email, code);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      if (user.status !== 'ACTIVE' || user.deletedAt) {
        throw new ForbiddenException('This account has been deactivated');
      }
      const session = await this.sessions.create(user, meta);
      return { type: 'session' as const, ...session };
    }

    const token = randomToken();
    await this.prisma.otpCode.update({
      where: { id: otpId },
      data: { signupTokenHash: sha256(token) },
    });
    return {
      type: 'signup' as const,
      token,
      expiresAt: new Date(Date.now() + SIGNUP_TTL_MS),
    };
  }

  async staffLogin(
    input: { businessCode: string; employeeCode: string; password: string },
    meta: ClientMeta,
  ) {
    const invalid = new UnauthorizedException('Business code, employee ID or password is wrong');

    const tenant = await this.prisma.tenant.findUnique({
      where: { businessCode: input.businessCode },
    });
    if (!tenant || tenant.deletedAt) throw invalid;

    // The row lock makes the attempt limit apply across requests and API instances.
    const user = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
        SELECT id FROM "User"
        WHERE "tenantId" = ${tenant.id}::uuid AND "employeeCode" = ${input.employeeCode}
        FOR UPDATE
      `;
        const account = await tx.user.findUnique({
          where: {
            tenantId_employeeCode: { tenantId: tenant.id, employeeCode: input.employeeCode },
          },
        });
        if (!account?.passwordHash || account.deletedAt || account.status !== 'ACTIVE') return null;

        const locked = account.passwordLockedAt;
        if (locked && Date.now() - locked.getTime() < PASSWORD_LOCK_MS) return null;

        if (!(await bcrypt.compare(input.password, account.passwordHash))) {
          const failures = locked ? 1 : account.passwordFailures + 1;
          await tx.user.update({
            where: { id: account.id },
            data: {
              passwordFailures: failures,
              passwordLockedAt: failures >= MAX_PASSWORD_FAILURES ? new Date() : null,
            },
          });
          return null;
        }

        await tx.user.update({
          where: { id: account.id },
          data: { passwordFailures: 0, passwordLockedAt: null },
        });
        return account;
      },
      { timeout: 10_000 },
    );
    if (!user) throw invalid;

    return this.sessions.create(user, meta);
  }

  logout(auth: AuthUser) {
    return this.sessions.revoke(auth.sessionId);
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: {
        role: { select: { id: true, name: true } },
        tenant: true,
        outlets: { select: { outletId: true } },
      },
    });

    const seesAll = user.isOwner || user.allOutlets;
    const outlets = await this.prisma.outlet.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        isActive: true,
        ...(seesAll ? {} : { id: { in: user.outlets.map((o) => o.outletId) } }),
      },
      select: { id: true, name: true, code: true, city: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      offlineExpiresAt: new Date(
        Math.min(Date.parse(auth.expiresAt ?? '') || Date.now(), Date.now() + 12 * 60 * 60 * 1000),
      ).toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        employeeCode: user.employeeCode,
        isOwner: user.isOwner,
        role: user.role,
      },
      permissions: auth.permissions,
      business: {
        id: user.tenant.id,
        name: user.tenant.name,
        businessCode: user.tenant.businessCode,
        businessType: user.tenant.businessType,
        status: user.tenant.status,
      },
      outlets,
    };
  }
}
