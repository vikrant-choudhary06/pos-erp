import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Clears out rows that are only useful for a short while. */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async run() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const codes = await this.prisma.otpCode.deleteMany({ where: { createdAt: { lt: dayAgo } } });
    const sessions = await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: monthAgo } }, { revokedAt: { lt: monthAgo } }],
      },
    });
    this.logger.log(`Removed ${codes.count} login codes and ${sessions.count} old sessions`);
  }
}
