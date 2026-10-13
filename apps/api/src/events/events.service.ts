import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  catchError,
  defer,
  EMPTY,
  exhaustMap,
  filter,
  finalize,
  fromEvent,
  map,
  merge,
  Observable,
  takeWhile,
  timer,
} from 'rxjs';
import { AuthUser } from '../auth/decorators';
import { SessionsService } from '../auth/sessions.service';

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
  private readonly connections = new Map<string, number>();
  private connectionCount = 0;

  constructor(private sessions: SessionsService) {}

  emit(event: OutletEvent) {
    this.bus.emit('event', event);
  }

  stream(user: AuthUser, outletId: string): Observable<MessageEvent> {
    this.checkLimit(user.userId);
    return defer(() => {
      this.checkLimit(user.userId);
      this.connections.set(user.userId, (this.connections.get(user.userId) ?? 0) + 1);
      this.connectionCount++;
      const events = fromEvent(this.bus, 'event').pipe(
        map((e) => e as OutletEvent),
        filter((e) => e.outletId === outletId),
        map((e) => ({ type: e.type, id: e.id })),
      );
      // Idle streams are checked too; only every 25th tick is sent as a ping.
      const ticks = timer(0, 1_000).pipe(map((n) => (n % 25 === 0 ? { type: 'ping' } : null)));
      return merge(events, ticks).pipe(
        // Coalesce bursts while checking access instead of queuing unlimited work.
        exhaustMap(async (data) => ({
          allowed: await this.sessions.canStream(user, outletId),
          data,
        })),
        takeWhile((result) => result.allowed),
        filter((result) => result.data !== null),
        map(({ data }) => ({ data }) as MessageEvent),
        catchError(() => EMPTY),
        finalize(() => {
          const remaining = (this.connections.get(user.userId) ?? 1) - 1;
          if (remaining) this.connections.set(user.userId, remaining);
          else this.connections.delete(user.userId);
          this.connectionCount--;
        }),
      );
    });
  }

  private checkLimit(userId: string) {
    if ((this.connections.get(userId) ?? 0) >= 5 || this.connectionCount >= 500) {
      throw new HttpException('Too many live connections', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
