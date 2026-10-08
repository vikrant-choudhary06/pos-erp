import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [CleanupService],
})
export class HealthModule {}
