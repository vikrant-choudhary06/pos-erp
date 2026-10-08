import { Controller, Get, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Can('outlet.manage')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('userId', new ParseUUIDPipe({ optional: true })) userId?: string,
    @Query('before') before?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.audit.list(user.tenantId, {
      action,
      userId,
      before: before && !Number.isNaN(Date.parse(before)) ? before : undefined,
      limit,
    });
  }
}
