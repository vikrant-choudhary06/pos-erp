import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { StockService } from './stock.service';

@Module({
  controllers: [InventoryController, PurchasesController],
  providers: [InventoryService, PurchasesService, StockService],
  exports: [StockService],
})
export class InventoryModule {}
