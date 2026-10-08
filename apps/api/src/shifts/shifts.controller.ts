import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CashMovementType } from '@prisma/client';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { ShiftsService } from './shifts.service';

const money = () => IsNumber({ maxDecimalPlaces: 2 });
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class OpenShiftDto {
  @IsUUID()
  outletId: string;

  @money()
  @Min(0)
  @Max(10_000_000)
  openingCash: number;
}

class CashDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @money()
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reason: string;
}

class CloseShiftDto {
  @money()
  @Min(0)
  @Max(10_000_000)
  closingCash: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

@Can('shift.manage')
@Controller('shifts')
export class ShiftsController {
  constructor(private shifts: ShiftsService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.shifts.current(user, outletId);
  }

  @Get()
  history(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.shifts.history(user, outletId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.get(user, id);
  }

  @Post()
  open(@CurrentUser() user: AuthUser, @Body() body: OpenShiftDto) {
    return this.shifts.open(user, body.outletId, body.openingCash);
  }

  @Post(':id/cash')
  @HttpCode(200)
  cash(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CashDto,
  ) {
    return this.shifts.addCash(user, id, body.type, body.amount, body.reason);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CloseShiftDto,
  ) {
    return this.shifts.close(user, id, body.closingCash, body.notes);
  }
}
