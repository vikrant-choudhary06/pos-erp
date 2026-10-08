import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BaseUnit } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;
const qty = () => IsNumber({ maxDecimalPlaces: 3 });

export class InventoryItemDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sku?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsEnum(BaseUnit)
  baseUnit: BaseUnit;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  purchaseUnit?: string;

  @IsOptional()
  @qty()
  @Min(0.001)
  @Max(100_000)
  purchaseUnitFactor?: number;

  @IsOptional()
  @qty()
  @Min(0)
  @Max(10_000_000)
  reorderLevel?: number;
}

export class UpdateInventoryItemDto extends PartialType(InventoryItemDto) {}

export class AdjustmentDto {
  @IsUUID()
  outletId: string;

  @IsUUID()
  inventoryItemId: string;

  /** OPENING/WASTAGE take a quantity, COUNT takes what was physically counted */
  @IsIn(['OPENING', 'WASTAGE', 'COUNT'])
  kind: 'OPENING' | 'WASTAGE' | 'COUNT';

  @qty()
  @Min(0)
  @Max(10_000_000)
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000)
  unitCost?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class IngredientDto {
  @IsUUID()
  inventoryItemId: string;

  @qty()
  @Min(0.001)
  @Max(100_000)
  quantity: number;
}

export class RecipeDto {
  @IsOptional()
  @IsUUID()
  variantId?: string | null;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IngredientDto)
  ingredients: IngredientDto[];
}
