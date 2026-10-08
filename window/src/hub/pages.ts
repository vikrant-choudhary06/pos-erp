import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Cloud } from './cloud';

// The tills' screens are plain Next.js pages. The hub keeps a copy of the
// ones a shop needs offline (POS, kitchen, lock, login) and every static file
// they load, so a tablet can still open the POS when the internet is down.

export const OFFLINE_PAGES = ['/pos', '/kitchen', '/lock', '/login'];

type Saved = { type: string; body: Buffer };

export class Pages {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'pages');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  static wanted(pathname: string) {
    return (
      pathname.startsWith('/_next/static/') ||
      OFFLINE_PAGES.includes(pathname) ||
      pathname === '/favicon.ico' ||
      pathname === '/favicon.svg'
    );
  }

  get(pathname: string): Saved | null {
    const file = this.file(pathname);
    try {
      const type = fs.readFileSync(`${file}.type`, 'utf8');
      return { type, body: fs.readFileSync(file) };
    } catch {
      return null;
    }
  }

  put(pathname: string, type: string, body: Buffer) {
    const file = this.file(pathname);
    fs.writeFileSync(file, body);
    fs.writeFileSync(`${file}.type`, type);
  }

  /**
   * Fetch the offline pages and everything they reference, so the first
   * outage doesn't depend on which screens someone happened to open.
   */
  async warm(cloud: Cloud, session: string) {
    const assets = new Set<string>();
    for (const page of OFFLINE_PAGES) {
      try {
        const reply = await cloud.request('GET', page, { session });
        const type = String(reply.headers['content-type'] ?? '');
        if (reply.status !== 200 || !type.includes('text/html')) continue;
        this.put(page, type, reply.body);
        for (const m of reply.body.toString('utf8').matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) {
          assets.add(m[0]);
        }
      } catch {
        return;
      }
    }

    for (const asset of assets) {
      if (this.get(asset)) continue;
      try {
        const reply = await cloud.request('GET', asset);
        if (reply.status === 200) {
          this.put(asset, String(reply.headers['content-type'] ?? ''), reply.body);
        }
      } catch {
        return;
      }
    }
  }

  private file(pathname: string) {
    return path.join(this.dir, crypto.createHash('sha1').update(pathname).digest('hex'));
  }
}
