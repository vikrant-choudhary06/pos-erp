import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import {
  EnableHotelDto,
  RoomDto,
  RoomStatusDto,
  RoomTypeDto,
  UpdateRoomTypeDto,
  ReservationDto,
  ChangeStayDto,
  CancelReservationDto,
  FolioEntryDto,
  CloseDayDto,
} from './dto';
import { PmsAccessService, parseHotelDate } from './pms-access.service';
import { HotelRoomsService } from './rooms/rooms.service';
import { HotelReservationsService } from './reservations/reservations.service';
import { HotelFoliosService } from './folios/folios.service';
import { PrismaService } from '../prisma/prisma.service';
import { hotelDateKey, hotelNights, toPaise } from '@pos/shared';

@Controller('pms')
export class PmsController {
  constructor(
    private access: PmsAccessService,
    private rooms: HotelRoomsService,
    private reservations: HotelReservationsService,
    private folios: HotelFoliosService,
    private prisma: PrismaService,
  ) {}

  @Get('properties')
  properties(@CurrentUser() user: AuthUser) {
    if (!user.isOwner && !user.permissions.some((permission) => permission.startsWith('hotel.')))
      throw new ForbiddenException('Hotel access is required');
    return this.access.list(user);
  }
  @Post('properties')
  @Can('hotel.manage')
  enable(@CurrentUser() user: AuthUser, @Body() dto: EnableHotelDto) {
    return this.rooms.enable(user, dto);
  }

  @Get(':propertyId/rooms')
  listRooms(@CurrentUser() user: AuthUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    if (
      !user.isOwner &&
      !['hotel.view', 'hotel.manage', 'hotel.housekeeping'].some((permission) =>
        user.permissions.includes(permission),
      )
    )
      throw new ForbiddenException('Hotel access is required');
    return this.rooms.list(user, propertyId);
  }
  @Post(':propertyId/rooms')
  @Can('hotel.manage')
  createRoom(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: RoomDto,
  ) {
    return this.rooms.create(user, propertyId, dto);
  }
  @Patch(':propertyId/rooms/:id/status')
  @Can('hotel.housekeeping')
  roomStatus(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoomStatusDto,
  ) {
    return this.rooms.status(user, propertyId, id, dto);
  }

  @Get(':propertyId/room-types')
  roomTypes(@CurrentUser() user: AuthUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    if (
      !user.isOwner &&
      !['hotel.view', 'hotel.manage'].some((permission) => user.permissions.includes(permission))
    )
      throw new ForbiddenException('Hotel access is required');
    return this.rooms.types(user, propertyId);
  }
  @Post(':propertyId/room-types')
  @Can('hotel.manage')
  createType(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: RoomTypeDto,
  ) {
    return this.rooms.createType(user, propertyId, dto);
  }
  @Patch(':propertyId/room-types/:id')
  @Can('hotel.manage')
  updateType(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    return this.rooms.updateType(user, propertyId, id, dto);
  }

  @Get(':propertyId/reservations')
  @Can('hotel.view')
  listReservations(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reservations.list(user, propertyId, from, to);
  }
  @Post(':propertyId/reservations')
  @Can('hotel.frontdesk')
  createReservation(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: ReservationDto,
  ) {
    return this.reservations.create(user, propertyId, dto);
  }
  @Get(':propertyId/reservations/:id')
  @Can('hotel.view')
  reservation(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.folios.get(user, propertyId, id);
  }
  @Patch(':propertyId/reservations/:id')
  @Can('hotel.frontdesk')
  change(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStayDto,
  ) {
    return this.reservations.change(user, propertyId, id, dto);
  }
  @Post(':propertyId/reservations/:id/check-in')
  @Can('hotel.frontdesk')
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservations.checkIn(user, propertyId, id);
  }
  @Post(':propertyId/reservations/:id/check-out')
  @Can('hotel.frontdesk', 'hotel.billing')
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservations.checkout(user, propertyId, id);
  }
  @Post(':propertyId/reservations/:id/cancel')
  @Can('hotel.frontdesk')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReservationDto,
  ) {
    return this.reservations.cancel(user, propertyId, id, dto);
  }
  @Post(':propertyId/reservations/:id/entries')
  @Can('hotel.billing')
  entry(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FolioEntryDto,
  ) {
    return this.folios.add(user, propertyId, id, dto);
  }
  @Post(':propertyId/close-day')
  @Can('hotel.close_day')
  closeDay(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CloseDayDto,
  ) {
    return this.folios.closeDay(user, propertyId, dto);
  }

  @Get(':propertyId/report')
  @Can('hotel.view', 'reports.view')
  async report(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const property = await this.access.property(user, propertyId);
    const start = parseHotelDate(from),
      end = parseHotelDate(to);
    // Reuse the bounded calendar range validation.
    await this.reservations.list(user, propertyId, from, to);
    const [rooms, occupied, entries, closings] = await Promise.all([
      this.prisma.hotelRoom.count({ where: { propertyId } }),
      this.prisma.hotelReservation.count({ where: { propertyId, status: 'CHECKED_IN' } }),
      this.prisma.hotelFolioEntry.findMany({
        where: { reservation: { propertyId }, businessDate: { gte: start, lt: end } },
      }),
      this.prisma.hotelDayClosing.findMany({
        where: { propertyId },
        orderBy: { businessDate: 'desc' },
        take: 30,
      }),
    ]);
    const amount = (kinds: string[]) =>
      entries
        .filter((entry) => kinds.includes(entry.kind))
        .reduce((sum, entry) => sum + toPaise(entry.amount.toString()), 0) / 100;
    return {
      businessDate: hotelDateKey(property.businessDate),
      rooms,
      occupied,
      occupancyPercent: rooms ? Math.round((occupied / rooms) * 100) : 0,
      nightsInRange: hotelNights(start, end),
      roomRevenue: amount(['ROOM']),
      restaurantCharges: amount(['RESTAURANT']),
      extraCharges: amount(['EXTRA']),
      credits: -amount(['CREDIT']),
      collected: -amount(['PAYMENT']),
      refunded: amount(['REFUND']),
      closings,
    };
  }
}
