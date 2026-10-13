import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PmsModule } from '../pms/pms.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PosMenuService } from './pos-menu.service';

@Module({
  imports: [InventoryModule, PmsModule],
  controllers: [OrdersController],
  providers: [OrdersService, PosMenuService],
})
export class OrdersModule {}
