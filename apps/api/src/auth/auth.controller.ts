import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearCookie, SESSION_COOKIE, setCookie, SIGNUP_COOKIE } from './cookies';
import { AuthUser, CurrentUser, Public } from './decorators';
import { RequestCodeDto, StaffLoginDto, VerifyCodeDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('code')
  @HttpCode(200)
  async requestCode(@Body() body: RequestCodeDto) {
    await this.auth.sendCode(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('code/verify')
  @HttpCode(200)
  async verifyCode(
    @Body() body: VerifyCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyCode(body.email, body.code, clientMeta(req));

    if (result.type === 'signup') {
      setCookie(res, SIGNUP_COOKIE, result.token, result.expiresAt);
      return { next: 'onboarding' };
    }

    setCookie(res, SESSION_COOKIE, result.token, result.expiresAt);
    return { next: 'dashboard' };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('staff-login')
  @HttpCode(200)
  async staffLogin(
    @Body() body: StaffLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.staffLogin(body, clientMeta(req));
    setCookie(res, SESSION_COOKIE, session.token, session.expiresAt);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    clearCookie(res, SESSION_COOKIE);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}

function clientMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
