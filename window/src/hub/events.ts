import type { ServerResponse } from 'node:http';

type Event = { type: 'order' | 'kot' | 'table' | 'shift'; id?: string };

/**
 * Server-sent events while the cloud is away. Same messages the API sends,
 * so the tills and kitchen screen refresh exactly as they do online.
 */
export class LocalEvents {
  private clients = new Map<ServerResponse, { outletId: string; authorize: () => void }>();
  private ping = setInterval(() => this.write(() => true, { type: 'ping' }), 25_000);

  attach(res: ServerResponse, outletId: string, authorize: () => void) {
    authorize();
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(': hub\n\n');
    this.clients.set(res, { outletId, authorize });
    res.on('close', () => this.clients.delete(res));
  }

  emit(outletId: string, ...events: Event[]) {
    for (const event of events) this.write((o) => o === outletId, event);
  }

  /** Drop everyone so their browsers reconnect, this time to the cloud. */
  closeAll() {
    for (const res of this.clients.keys()) res.end();
    this.clients.clear();
  }

  stop() {
    clearInterval(this.ping);
    this.closeAll();
  }

  private write(match: (outletId: string) => boolean, event: object) {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const [res, { outletId, authorize }] of this.clients) {
      try {
        authorize();
      } catch {
        res.end();
        this.clients.delete(res);
        continue;
      }
      if (match(outletId)) res.write(line);
    }
  }
}
