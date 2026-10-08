import { BadRequestException, Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { ReportsService } from './reports.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function range(from?: string, to?: string) {
  if (!from || !to || !DATE.test(from) || !DATE.test(to)) {
    throw new BadRequestException('from and to should be dates like 2026-10-01');
  }
  return { from, to };
}

@Can('reports.view')
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('sales')
  sales(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId', new ParseUUIDPipe({ optional: true })) outletId?: string,
  ) {
    return this.reports.sales(user, { ...range(from, to), outletId });
  }

  @Get('items')
  items(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId', new ParseUUIDPipe({ optional: true })) outletId?: string,
  ) {
    return this.reports.items(user, { ...range(from, to), outletId });
  }

  @Get('tax')
  tax(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId', new ParseUUIDPipe({ optional: true })) outletId?: string,
  ) {
    return this.reports.tax(user, { ...range(from, to), outletId });
  }
}
