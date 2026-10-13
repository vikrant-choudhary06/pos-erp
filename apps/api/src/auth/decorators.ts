import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@pos/shared';

export interface AuthUser {
  sessionId: string;
  expiresAt?: string;
  userId: string;
  tenantId: string;
  isOwner: boolean;
  permissions: string[];
  /** null means every outlet of the business */
  outletIds: string[] | null;
  /** set on a registered till; offline numbers use its code */
  deviceId: string | null;
  deviceCode: string | null;
}

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs all of these permissions. Owners always pass. */
export const Can = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
