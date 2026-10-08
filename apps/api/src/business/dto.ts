import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const gstin = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() || null : value;

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export class UpdateBusinessDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalName?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10 digit mobile number' })
  phone?: string;

  @Transform(trim)
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(gstin)
  @IsOptional()
  @Matches(GSTIN, { message: 'GSTIN looks wrong' })
  gstin?: string | null;
}

export class CreateOutletDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9]{2,10}$/, { message: 'Code should be 2-10 letters or digits' })
  code: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10 digit mobile number' })
  phone?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  city: string;

  @Matches(/^\d{2}$/, { message: 'Pick a state' })
  stateCode: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Pincode should be 6 digits' })
  pincode?: string;

  @Transform(gstin)
  @IsOptional()
  @Matches(GSTIN, { message: 'GSTIN looks wrong' })
  gstin?: string | null;

  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'FSSAI number is 14 digits' })
  fssaiNo?: string;

  @IsOptional()
  @IsBoolean()
  priceIncludesTax?: boolean;
}

export class OutletSettingsDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(25)
  serviceChargePercent?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  billFooter?: string;

  @IsOptional()
  @IsBoolean()
  printKot?: boolean;
}

export class UpdateOutletDto extends PartialType(CreateOutletDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutletSettingsDto)
  settings?: OutletSettingsDto;
}
