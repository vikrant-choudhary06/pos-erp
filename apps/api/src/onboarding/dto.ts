import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { BusinessType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OnboardingDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  ownerName: string;

  @Transform(trim)
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10 digit mobile number' })
  phone: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  businessName: string;

  @IsEnum(BusinessType)
  businessType: BusinessType;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  outletName?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city: string;

  @Matches(/^\d{2}$/, { message: 'Pick a state' })
  stateCode: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsOptional()
  @Matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'GSTIN looks wrong' })
  gstin?: string;
}
