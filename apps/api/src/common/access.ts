import type { AuthUser } from '../auth/decorators';

export const canAccessOutlet = (user: AuthUser, outletId: string) =>
  user.outletIds === null || user.outletIds.includes(outletId);
