import path from 'node:path';
import type { NextConfig } from 'next';

// Read at build time: rewrites are baked into the production build.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const config: NextConfig = {
  // standalone bundles for Docker/CI; off by default because it needs symlinks,
  // which Windows only allows in developer mode
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  poweredByHeader: false,
  // the floating dev button sits on top of sheet and POS buttons
  devIndicators: false,

  // Proxy API calls so the session cookie stays first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
