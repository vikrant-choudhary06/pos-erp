import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { DEFAULT_ROLES, INDIAN_STATES } from '@pos/shared';
import { SIGNUP_TTL_MS } from '../auth/auth.service';
import { ClientMeta, SessionsService } from '../auth/sessions.service';
import { randomDigits, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingDto } from './dto';

const DEFAULT_TAXES = [
  {
    name: 'GST 5%',
    components: [
      { name: 'CGST', rate: 2.5 },
      { name: 'SGST', rate: 2.5 },
    ],
  },
  {
    name: 'GST 18%',
    components: [
      { name: 'CGST', rate: 9 },
      { name: 'SGST', rate: 9 },
    ],
  },
];

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionsService,
  ) {}

  async pendingEmail(signupToken: string | undefined) {
    const otp = await this.findSignup(signupToken);
    return otp?.email ?? null;
  }

  async complete(signupToken: string | undefined, input: OnboardingDto, meta: ClientMeta) {
    const otp = await this.findSignup(signupToken);
    if (!otp)
      throw new UnauthorizedException('Your sign up session expired. Please sign in again.');

    const taken = await this.prisma.user.findUnique({ where: { email: otp.email } });
    if (taken) throw new ConflictException('This email already has an account');

    const state = INDIAN_STATES.find((s) => s.code === input.stateCode);
    const businessCode = await this.newBusinessCode(input.businessName);

    const owner = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName,
          businessCode,
          businessType: input.businessType,
          email: otp.email,
          phone: input.phone,
          gstin: input.gstin,
        },
      });

      const roles = await Promise.all(
        DEFAULT_ROLES.map((role) =>
          tx.role.create({ data: { ...role, tenantId: tenant.id, isSystem: true } }),
        ),
      );
      const ownerRole = roles.find((r) => r.name === 'Owner')!;

      await tx.outlet.create({
        data: {
          tenantId: tenant.id,
          name: input.outletName || input.businessName,
          code: outletCode(input.city),
          phone: input.phone,
          city: input.city,
          state: state?.name,
          stateCode: input.stateCode,
          gstin: input.gstin,
        },
      });

      for (const tax of DEFAULT_TAXES) {
        await tx.taxGroup.create({
          data: {
            tenantId: tenant.id,
            name: tax.name,
            components: {
              create: tax.components.map((c, i) => ({ ...c, tenantId: tenant.id, sortOrder: i })),
            },
          },
        });
      }

      await tx.otpCode.update({ where: { id: otp.id }, data: { signupTokenHash: null } });

      return tx.user.create({
        data: {
          tenantId: tenant.id,
          roleId: ownerRole.id,
          employeeCode: 'E001',
          name: input.ownerName,
          email: otp.email,
          phone: input.phone,
          isOwner: true,
          allOutlets: true,
        },
      });
    });

    return this.sessions.create(owner, meta);
  }

  private findSignup(token: string | undefined) {
    if (!token) return null;
    return this.prisma.otpCode.findFirst({
      where: {
        signupTokenHash: sha256(token),
        verifiedAt: { gt: new Date(Date.now() - SIGNUP_TTL_MS) },
      },
    });
  }

  // Short code staff type in on the login screen, e.g. "SHAR4821"
  private async newBusinessCode(name: string) {
    const prefix = name
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4)
      .padEnd(4, 'X');

    for (let i = 0; i < 10; i++) {
      const code = prefix + randomDigits(4);
      const exists = await this.prisma.tenant.findUnique({ where: { businessCode: code } });
      if (!exists) return code;
    }
    throw new InternalServerErrorException('Could not generate a business code, try again');
  }
}

function outletCode(city: string) {
  const letters = city
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  return `${letters}01`;
}
