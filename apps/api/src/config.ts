// Fail at boot instead of on the first request that needs a missing value.
export function validateEnv(env: Record<string, unknown>) {
  const errors: string[] = [];
  const prod = env.NODE_ENV === 'production';

  if (!env.DATABASE_URL) errors.push('DATABASE_URL is required');

  const secret = String(env.OTP_SECRET ?? '');
  if (!secret) errors.push('OTP_SECRET is required');
  else if (prod && (secret.length < 32 || secret === 'change-me')) {
    errors.push('OTP_SECRET should be a random string of 32+ characters in production');
  }

  if (prod && env.DEV_LOGIN_CODE) errors.push('DEV_LOGIN_CODE must not be set in production');
  if (env.DEV_LOGIN_CODE && !/^\d{6}$/.test(String(env.DEV_LOGIN_CODE))) {
    errors.push('DEV_LOGIN_CODE should be 6 digits');
  }

  if (prod && !env.WEB_URL) errors.push('WEB_URL is required in production');
  if (prod && !env.RESEND_API_KEY) errors.push('RESEND_API_KEY is required in production');

  if (errors.length) {
    throw new Error(`Invalid environment:\n  - ${errors.join('\n  - ')}`);
  }
  return env;
}
