import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ALL_PERMISSIONS } from '@pos/shared';
import { UserStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

// empty string from a cleared input means "remove it"
const clearable = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() || null : value;

export class CreateStaffDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Transform(clearable)
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10 digit mobile number' })
  phone?: string | null;

  @Transform(clearable)
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsUUID()
  roleId: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password should be at least 6 characters' })
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @Matches(/^\d{4,6}$/, { message: 'PIN should be 4 to 6 digits' })
  pin?: string;

  @IsOptional()
  @IsBoolean()
  allOutlets?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  outletIds?: string[];
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class RoleDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions: string[];
}
