import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { HotelRoomStatus, PaymentMethod } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
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
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EnableHotelDto {
  @IsUUID() outletId: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) name: string;
}

export class RoomTypeDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsInt() @Min(1) @Max(20) capacity: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) nightlyRate: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxPercent: number;
}
export class UpdateRoomTypeDto extends PartialType(RoomTypeDto) {}

export class RoomDto {
  @IsUUID() roomTypeId: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(20) number: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) floor?: string;
}
export class RoomStatusDto {
  @IsEnum(HotelRoomStatus) status: HotelRoomStatus;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) note?: string;
}

export class ReservationDto {
  @IsUUID() id: string;
  @IsUUID() roomId: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) arrival: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) departure: string;
  @IsInt() @Min(1) @Max(20) guests: number;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) guestName: string;
  @Transform(trim) @Matches(/^\+?[0-9 ()-]{7,20}$/) phone: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}
export class ChangeStayDto {
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) departure?: string;
  @IsOptional() @IsBoolean() allowRoomCharges?: boolean;
}
export class CancelReservationDto {
  @IsIn(['CANCELLED', 'NO_SHOW']) status: 'CANCELLED' | 'NO_SHOW';
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(200) reason: string;
}
export class FolioEntryDto {
  @IsUUID() id: string;
  @IsIn(['EXTRA', 'PAYMENT', 'REFUND', 'CREDIT']) kind: 'EXTRA' | 'PAYMENT' | 'REFUND' | 'CREDIT';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(200) description: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) reference?: string;
}
export class CloseDayDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
}
export class ChargeRoomDto {
  @IsUUID() reservationId: string;
}
