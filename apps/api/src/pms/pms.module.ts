import { Module } from '@nestjs/common';
import { PmsController } from './pms.controller';
import { PmsAccessService } from './pms-access.service';
import { HotelRoomsService } from './rooms/rooms.service';
import { HotelReservationsService } from './reservations/reservations.service';
import { HotelFoliosService } from './folios/folios.service';

@Module({
  controllers: [PmsController],
  providers: [PmsAccessService, HotelRoomsService, HotelReservationsService, HotelFoliosService],
  exports: [PmsAccessService],
})
export class PmsModule {}
