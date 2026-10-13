import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { hotelDate, hotelToday } from '@pos/shared';
import { AuthUser } from '../../auth/decorators';
import { canAccessOutlet } from '../../common/access';
import { requirePermission } from '../../common/permissions';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EnableHotelDto, RoomDto, RoomStatusDto, RoomTypeDto, UpdateRoomTypeDto } from '../dto';
import { PmsAccessService } from '../pms-access.service';

@Injectable()
export class HotelRoomsService {
  constructor(
    private prisma: PrismaService,
    private access: PmsAccessService,
    private audit: AuditService,
  ) {}

  async enable(user: AuthUser, dto: EnableHotelDto) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: dto.outletId, tenantId: user.tenantId, isActive: true, deletedAt: null },
    });
    if (!outlet || !canAccessOutlet(user, outlet.id))
      throw new NotFoundException('Outlet not found');
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.hotelProperty.create({
        data: {
          ...dto,
          tenantId: user.tenantId,
          businessDate: hotelDate(hotelToday(outlet.timezone)),
        },
      });
      await this.audit.log(
        user,
        {
          action: 'hotel.enable',
          entityType: 'HotelProperty',
          entityId: property.id,
          outletId: outlet.id,
          after: dto,
        },
        tx,
      );
      return property;
    });
  }

  async list(user: AuthUser, propertyId: string) {
    await this.access.property(user, propertyId);
    const rooms = await this.prisma.hotelRoom.findMany({
      where: { propertyId },
      include: {
        roomType: true,
        _count: { select: { reservations: { where: { status: 'CHECKED_IN' } } } },
      },
      orderBy: { number: 'asc' },
    });
    return rooms.map(({ _count, ...room }) => ({ ...room, occupied: _count.reservations > 0 }));
  }
  async types(user: AuthUser, propertyId: string) {
    await this.access.property(user, propertyId);
    return this.prisma.hotelRoomType.findMany({ where: { propertyId }, orderBy: { name: 'asc' } });
  }
  async createType(user: AuthUser, propertyId: string, dto: RoomTypeDto) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const type = await tx.hotelRoomType.create({ data: { propertyId, ...dto } });
      await this.audit.log(
        user,
        {
          action: 'hotel.room_type.create',
          entityType: 'HotelRoomType',
          entityId: type.id,
          outletId: property.outletId,
          after: dto,
        },
        tx,
      );
      return type;
    });
  }
  async updateType(user: AuthUser, propertyId: string, id: string, dto: UpdateRoomTypeDto) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const before = await tx.hotelRoomType.findFirst({ where: { id, propertyId } });
      if (!before) throw new NotFoundException('Room type not found');
      if (dto.capacity && dto.capacity < before.capacity) {
        const oversized = await tx.hotelReservation.count({
          where: {
            room: { roomTypeId: id },
            status: { in: ['RESERVED', 'CHECKED_IN'] },
            guests: { gt: dto.capacity },
          },
        });
        if (oversized) throw new BadRequestException('Existing reservations exceed that capacity');
      }
      const type = await tx.hotelRoomType.update({ where: { id }, data: dto });
      await this.audit.log(
        user,
        {
          action: 'hotel.room_type.update',
          entityType: 'HotelRoomType',
          entityId: id,
          outletId: property.outletId,
          before,
          after: dto,
        },
        tx,
      );
      return type;
    });
  }
  async create(user: AuthUser, propertyId: string, dto: RoomDto) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      if (!(await tx.hotelRoomType.findFirst({ where: { id: dto.roomTypeId, propertyId } })))
        throw new NotFoundException('Room type not found');
      const room = await tx.hotelRoom.create({ data: { propertyId, ...dto } });
      await this.audit.log(
        user,
        {
          action: 'hotel.room.create',
          entityType: 'HotelRoom',
          entityId: room.id,
          outletId: property.outletId,
          after: dto,
        },
        tx,
      );
      return room;
    });
  }
  async status(user: AuthUser, propertyId: string, id: string, dto: RoomStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const property = await this.access.lock(user, propertyId, tx);
      const room = await tx.hotelRoom.findFirst({ where: { id, propertyId } });
      if (!room) throw new NotFoundException('Room not found');
      if (room.status === 'MAINTENANCE' || dto.status === 'MAINTENANCE')
        requirePermission(user, 'hotel.manage');
      if (
        dto.status === 'MAINTENANCE' &&
        (await tx.hotelReservation.count({
          where: { roomId: id, status: { in: ['RESERVED', 'CHECKED_IN'] } },
        }))
      )
        throw new BadRequestException(
          'Move or cancel active reservations before blocking this room',
        );
      const updated = await tx.hotelRoom.update({ where: { id }, data: dto });
      await this.audit.log(
        user,
        {
          action: 'hotel.room.status',
          entityType: 'HotelRoom',
          entityId: id,
          outletId: property.outletId,
          before: { status: room.status },
          after: dto,
        },
        tx,
      );
      return updated;
    });
  }
}
