import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEVICE_COOKIE, readSessionToken } from './cookies';
import { IS_PUBLIC, PERMISSIONS_KEY } from './decorators';
import { SessionsService } from './sessions.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = readSessionToken(req);
    const user = token ? await this.sessions.resolve(token, req.cookies?.[DEVICE_COOKIE]) : null;
    if (!user) throw new UnauthorizedException();

    req.user = user;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (required?.length && !user.isOwner) {
      const allowed = required.every((p) => user.permissions.includes(p));
      if (!allowed) throw new ForbiddenException("You don't have access to this");
    }

    return true;
  }
}
