import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { CustomersService } from './customers.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;
const PHONE = /^[6-9]\d{9}$/;

class CustomerDto {
  @Transform(trim)
  @Matches(PHONE, { message: 'Enter a 10 digit mobile number' })
  phone: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsDateString()
  anniversary?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsOptional()
  @Matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'GSTIN looks wrong' })
  gstin?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

class UpdateCustomerDto extends PartialType(CustomerDto) {}

class SettleDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

@Can('order.take')
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('dues', new DefaultValuePipe(false), ParseBoolPipe) dues = false,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
  ) {
    return this.customers.list(user.tenantId, { search, dues, page: Math.max(page, 1) });
  }

  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query('phone') phone = '') {
    return PHONE.test(phone) ? this.customers.lookup(user.tenantId, phone) : null;
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CustomerDto) {
    return this.customers.create(user.tenantId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.customers.update(user.tenantId, id, body);
  }

  @Can('bill.settle')
  @Post(':id/settle')
  @HttpCode(200)
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SettleDto,
  ) {
    return this.customers.settleDues(user, id, body);
  }
}
