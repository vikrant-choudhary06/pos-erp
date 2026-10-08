import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators';

const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * When a till syncs work done offline it sends the time it really happened.
 * Trust it within reason: not in the future, not more than a few days old.
 */
export function clientTime(value?: string): Date {
  if (!value) return new Date();
  const at = new Date(value);
  const now = Date.now();
  if (Number.isNaN(at.getTime())) return new Date();
  if (at.getTime() > now + CLOCK_SKEW_MS) return new Date();
  if (at.getTime() < now - MAX_AGE_MS) {
    throw new BadRequestException(
      'This offline entry is too old to sync. Ask the owner to add it by hand.',
    );
  }
  return at;
}

/** Offline numbers carry the till's code, so only that till may use them. */
export function requireDevicePrefix(
  user: AuthUser,
  value: string,
  prefix: (code: string) => string,
) {
  if (!user.deviceCode || !value.startsWith(prefix(user.deviceCode))) {
    throw new BadRequestException('Offline numbers can only come from a registered till');
  }
}
