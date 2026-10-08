import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { PurchasesService } from './purchases.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

class VendorDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^[0-9+\- ]{6,15}$/, { message: 'Phone number looks wrong' })
  phone?: string;

  @Transform(trim)
  @IsOptional()
  @IsEmail()
  email?: string;

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
}

class UpdateVendorDto extends PartialType(VendorDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class VendorPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

class PurchaseLineDto {
  @IsUUID()
  inventoryItemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(40)
  taxRate?: number;
}

class PurchaseDto {
  @IsUUID()
  outletId: string;

  @IsUUID()
  vendorId: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vendorInvoiceNo?: string;

  @IsOptional()
  @IsDateString()
  vendorInvoiceDate?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines: PurchaseLineDto[];
}

@Can('purchase.manage')
@Controller()
export class PurchasesController {
  constructor(private purchases: PurchasesService) {}

  @Get('vendors')
  vendors(@CurrentUser() user: AuthUser) {
    return this.purchases.listVendors(user.tenantId);
  }

  @Post('vendors')
  createVendor(@CurrentUser() user: AuthUser, @Body() body: VendorDto) {
    return this.purchases.createVendor(user.tenantId, body);
  }

  @Patch('vendors/:id')
  updateVendor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVendorDto,
  ) {
    return this.purchases.updateVendor(user.tenantId, id, body);
  }

  @Get('vendors/:id/ledger')
  ledger(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.vendorLedger(user.tenantId, id);
  }

  @Post('vendors/:id/payments')
  @HttpCode(200)
  payVendor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VendorPaymentDto,
  ) {
    return this.purchases.payVendor(user, id, body);
  }

  @Get('purchases')
  list(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.purchases.listPurchases(user, outletId);
  }

  @Get('purchases/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.getPurchase(user, id);
  }

  @Post('purchases')
  create(@CurrentUser() user: AuthUser, @Body() body: PurchaseDto) {
    return this.purchases.createPurchase(user, body);
  }
}
