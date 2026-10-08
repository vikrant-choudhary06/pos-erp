import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AreaDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class TableDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number;

  @IsOptional()
  @IsUUID()
  areaId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// "T1".."T12" in one go
export class BulkTablesDto {
  @Transform(trim)
  @IsString()
  @MaxLength(10)
  prefix: string;

  @IsInt()
  @Min(0)
  @Max(999)
  start: number;

  @IsInt()
  @Min(1)
  @Max(100)
  count: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number;

  @IsOptional()
  @IsUUID()
  areaId?: string;
}
