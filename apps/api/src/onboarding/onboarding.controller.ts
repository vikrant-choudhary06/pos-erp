import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { clearCookie, SESSION_COOKIE, setCookie, SIGNUP_COOKIE } from '../auth/cookies';
import { Public } from '../auth/decorators';
import { OnboardingDto } from './dto';
import { OnboardingService } from './onboarding.service';

@Public()
@Controller('onboarding')
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  @Get()
  async status(@Req() req: Request) {
    const email = await this.onboarding.pendingEmail(req.cookies?.[SIGNUP_COOKIE]);
    return { email };
  }

  @Post()
  async complete(
    @Body() body: OnboardingDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.onboarding.complete(req.cookies?.[SIGNUP_COOKIE], body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    clearCookie(res, SIGNUP_COOKIE);
    setCookie(res, SESSION_COOKIE, session.token, session.expiresAt);
    return { ok: true };
  }
}
