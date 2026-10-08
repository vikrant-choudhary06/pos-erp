import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class RequestCodeDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;
}

export class VerifyCodeDto extends RequestCodeDto {
  @Matches(/^\d{6}$/, { message: 'Code should be 6 digits' })
  code: string;
}

export class StaffLoginDto {
  @Transform(upperTrim)
  @IsString()
  @MinLength(3)
  businessCode: string;

  @Transform(upperTrim)
  @IsString()
  @MinLength(1)
  employeeCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password: string;
}
