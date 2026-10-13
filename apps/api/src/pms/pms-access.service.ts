import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hotelDate } from '@pos/shared';
import { AuthUser } from '../auth/decorators';
import { canAccessOutlet } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';

export type HotelDb = Prisma.TransactionClient;

export function parseHotelDate(value: string) {
  try {
    return hotelDate(value);
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}

@Injectable()
export class PmsAccessService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.hotelProperty.findMany({
      where: {
        tenantId: user.tenantId,
        outlet: { isActive: true, deletedAt: null },
        ...(user.outletIds && { outletId: { in: user.outletIds } }),
      },
      orderBy: { name: 'asc' },
      include: { outlet: { select: { name: true, timezone: true } } },
    });
  }

  async property(user: AuthUser, id: string, db: HotelDb = this.prisma) {
    const property = await db.hotelProperty.findFirst({
      where: { id, tenantId: user.tenantId, outlet: { isActive: true, deletedAt: null } },
      include: { outlet: { select: { timezone: true } } },
    });
    if (!property || !canAccessOutlet(user, property.outletId))
      throw new NotFoundException('Hotel not found');
    return property;
  }

  // Every hotel mutation takes this lock first, including restaurant transfers.
  // Checkout and room charges therefore cannot change the balance concurrently.
  async lock(user: AuthUser, id: string, db: HotelDb) {
    await this.property(user, id, db);
    await db.$queryRaw`SELECT id FROM "HotelProperty" WHERE id = ${id}::uuid FOR UPDATE`;
    return this.property(user, id, db);
  }

  async reservation(user: AuthUser, propertyId: string, id: string, db: HotelDb = this.prisma) {
    await this.property(user, propertyId, db);
    const reservation = await db.hotelReservation.findFirst({
      where: { id, propertyId },
      include: {
        room: { include: { roomType: true } },
        guest: true,
        entries: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }
}
