import { ForbiddenException } from '@nestjs/common';
import type { Permission } from '@pos/shared';
import type { AuthUser } from '../auth/decorators';

export const hasPermission = (user: AuthUser, permission: Permission) =>
  user.isOwner || user.permissions.includes(permission);

/** For checks that depend on the data, where @Can() on the route isn't enough. */
export function requirePermission(user: AuthUser, permission: Permission, message?: string) {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenException(message ?? "You don't have access to this");
  }
}
