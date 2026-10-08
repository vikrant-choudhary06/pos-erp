import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hmac, randomDigits, safeEqual } from '../common/crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;
const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class OtpService {
  private readonly secret: string;
  private readonly devCode?: string;

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow('OTP_SECRET');
    // fixed code for local testing and e2e runs; config.ts refuses it in production
    this.devCode = config.get('DEV_LOGIN_CODE') || undefined;
  }

  async send(email: string) {
    const recent = await this.prisma.otpCode.count({
      where: { email, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
    });
    if (recent >= MAX_CODES_PER_WINDOW) {
      throw new HttpException(
        'Too many codes requested. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.devCode ?? randomDigits(6);
    await this.prisma.otpCode.create({
      data: {
        email,
        codeHash: this.hash(email, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await this.mail.sendLoginCode(email, code);
  }

  /** Returns the id of the verified code row. */
  async verify(email: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { email, verifiedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('This code has expired. Request a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Too many wrong attempts. Request a new code.');
    }

    if (!safeEqual(this.hash(email, code), otp.codeHash)) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('That code is not correct');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { verifiedAt: new Date() },
    });

    return otp.id;
  }

  private hash(email: string, code: string) {
    return hmac(`${email}:${code}`, this.secret);
  }
}
