import type { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for cookie auth. SameSite=Lax already blocks most cross-site
 * posts; this also rejects any write whose Origin isn't our web app.
 * Requests without an Origin header (curl, server-to-server) pass, they
 * can't carry a victim's cookie anyway.
 */
export function sameOrigin(webUrl?: string) {
  const allowed = webUrl ? new URL(webUrl).origin : null;

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (SAFE.has(req.method) || !origin || !allowed) return next();

    // the web app proxies /api, so the API may also see its own host
    const self = `${req.protocol}://${req.get('host')}`;
    if (origin === allowed || origin === self) return next();

    res.status(403).json({ statusCode: 403, message: 'Cross-site request blocked' });
  };
}
