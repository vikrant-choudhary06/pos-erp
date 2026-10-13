import { Controller, Header, ParseUUIDPipe, Query, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { BusinessService } from '../business/business.service';
import { EventsService } from './events.service';

@SkipThrottle()
@Controller('events')
export class EventsController {
  constructor(
    private events: EventsService,
    private business: BusinessService,
  ) {}

  // no-transform stops proxies (and Next's gzip) from buffering the stream
  @Sse()
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  async stream(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    await this.business.outletFor(user, outletId);
    return this.events.stream(user, outletId);
  }
}
