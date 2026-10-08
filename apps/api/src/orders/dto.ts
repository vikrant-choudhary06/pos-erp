import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
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
import { DiscountType, OrderType, PaymentMethod } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  /** set by a till for orders taken offline, e.g. "D1-14" */
  @IsOptional()
  @Matches(/^D\d{1,3}-\d{1,6}$/)
  orderNo?: string;

  @IsOptional()
  @IsISO8601()
  openedAt?: string;

  @IsUUID()
  outletId: string;

  @IsEnum(OrderType)
  type: OrderType;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  covers?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10 digit mobile number' })
  customerPhone?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  covers?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10 digit mobile number' })
  customerPhone?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class NewItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  menuItemId: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999)
  quantity: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  modifierOptionIds?: string[];
}

export class AddItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NewItemDto)
  items: NewItemDto[];
}

export class UpdateItemDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999)
  quantity?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  notes?: string;
}

export class ReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Add a short reason' })
  @MaxLength(200)
  reason: string;
}

export class OptionalReasonDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class DiscountDto {
  @IsEnum(DiscountType)
  type: DiscountType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  value: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class PaymentDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class BillDto {
  /** set by a till for bills printed offline, e.g. "IND01/26-27/D1-00012" */
  @IsOptional()
  @Matches(/^[A-Z0-9]{2,10}\/\d{2}-\d{2}\/D\d{1,3}-\d{5,}$/)
  invoiceNo?: string;

  @IsOptional()
  @IsISO8601()
  issuedAt?: string;
}

export class PayDto {
  // empty is allowed for bills that come to zero after a discount
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];

  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  tip?: number;
}
