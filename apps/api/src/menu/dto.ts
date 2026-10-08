import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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
import { FoodType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

const price = () =>
  IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price can have at most 2 decimals' });

export class CategoryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class VariantDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @price()
  @Min(0)
  @Max(1_000_000)
  price: number;
}

export class CreateItemDto {
  @IsUUID()
  categoryId: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || null : value,
  )
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,8}$/, { message: 'Short code: up to 8 letters or digits' })
  shortCode?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsEnum(FoodType)
  foodType: FoodType;

  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{4,8}$/, { message: 'HSN/SAC code should be 4-8 digits' })
  hsnCode?: string;

  @IsOptional()
  @IsUUID()
  taxGroupId?: string | null;

  @price()
  @Min(0)
  @Max(1_000_000)
  basePrice: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  modifierGroupIds?: string[];
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

export class ModifierOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @price()
  @Min(0)
  @Max(100_000)
  price: number;
}

export class ModifierGroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @IsInt()
  @Min(0)
  @Max(20)
  minSelect: number;

  @IsInt()
  @Min(1)
  @Max(20)
  maxSelect: number;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionDto)
  options: ModifierOptionDto[];
}
