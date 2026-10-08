import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { filter, fromEvent, interval, map, merge, Observable } from 'rxjs';

export type OutletEvent = {
  outletId: string;
  type: 'order' | 'kot' | 'table' | 'shift' | 'menu';
  id?: string;
};

/**
 * In-process pub/sub for live screens (POS, kitchen display). Good for a
 * single API instance; swap the emitter for Redis pub/sub when scaling out.
 */
@Injectable()
export class EventsService {
  private readonly bus = new EventEmitter().setMaxListeners(0);

  emit(event: OutletEvent) {
    this.bus.emit('event', event);
  }

  stream(outletId: string): Observable<MessageEvent> {
    const events = fromEvent(this.bus, 'event').pipe(
      map((e) => e as OutletEvent),
      filter((e) => e.outletId === outletId),
      map((e) => ({ data: { type: e.type, id: e.id } }) as MessageEvent),
    );
    // keeps proxies from closing an idle connection
    const ping = interval(25_000).pipe(map(() => ({ data: { type: 'ping' } }) as MessageEvent));
    return merge(events, ping);
  }
}
