import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { DEVICE_COOKIE, SESSION_COOKIE, setCookie } from '../auth/cookies';
import { AuthUser, Can, CurrentUser, Public } from '../auth/decorators';
import { DevicesService } from './devices.service';

class RegisterDto {
  @IsUUID()
  outletId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;
}

class PinDto {
  @IsUUID()
  userId: string;

  @Matches(/^\d{4,6}$/, { message: 'PIN is 4 to 6 digits' })
  pin: string;
}

@Controller()
export class DevicesController {
  constructor(private devices: DevicesService) {}

  @Can('outlet.manage')
  @Get('devices')
  list(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.devices.list(user, outletId);
  }

  @Can('outlet.manage')
  @Post('devices')
  async register(
    @CurrentUser() user: AuthUser,
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { device, token } = await this.devices.register(user, body.outletId, body.name);
    setCookie(res, DEVICE_COOKIE, token, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    return { id: device.id, name: device.name, code: device.code };
  }

  @Can('outlet.manage')
  @Delete('devices/:id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.revoke(user, id);
  }

  @Get('devices/me')
  me(@CurrentUser() user: AuthUser, @Query('date') date = '', @Query('fy') fy = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}$/.test(fy)) {
      throw new BadRequestException('date and fy are required');
    }
    return this.devices.numbering(user, date, fy);
  }

  @Public()
  @Get('devices/current')
  current(@Req() req: Request) {
    return this.devices.lockScreen(req.cookies?.[DEVICE_COOKIE]);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('auth/pin')
  @HttpCode(200)
  async pin(@Body() body: PinDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.devices.pinLogin(
      req.cookies?.[DEVICE_COOKIE],
      body.userId,
      body.pin,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
    setCookie(res, SESSION_COOKIE, session.token, session.expiresAt);
    return { outletId: session.outletId };
  }
}
