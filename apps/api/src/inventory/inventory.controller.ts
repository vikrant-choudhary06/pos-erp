import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { hasPermission } from '../common/permissions';
import { AdjustmentDto, InventoryItemDto, RecipeDto, UpdateInventoryItemDto } from './dto';
import { InventoryService } from './inventory.service';

@Can('inventory.manage')
@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  // purchasing staff pick items too, so either permission will do
  @Can()
  @Get('items')
  items(@CurrentUser() user: AuthUser) {
    if (!hasPermission(user, 'inventory.manage') && !hasPermission(user, 'purchase.manage')) {
      throw new ForbiddenException("You don't have access to this");
    }
    return this.inventory.listItems(user.tenantId);
  }

  @Post('items')
  createItem(@CurrentUser() user: AuthUser, @Body() body: InventoryItemDto) {
    return this.inventory.createItem(user.tenantId, body);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateInventoryItemDto,
  ) {
    return this.inventory.updateItem(user.tenantId, id, body);
  }

  @Delete('items/:id')
  @HttpCode(204)
  removeItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.removeItem(user.tenantId, id);
  }

  @Get('stock')
  stock(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.inventory.stockLevels(user, outletId);
  }

  @Post('adjustments')
  adjust(@CurrentUser() user: AuthUser, @Body() body: AdjustmentDto) {
    return this.inventory.adjust(user, body);
  }

  @Get('movements')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('outletId', ParseUUIDPipe) outletId: string,
    @Query('itemId', new ParseUUIDPipe({ optional: true })) itemId?: string,
  ) {
    return this.inventory.movements(user, outletId, itemId);
  }

  @Get('recipes/:menuItemId')
  recipes(@CurrentUser() user: AuthUser, @Param('menuItemId', ParseUUIDPipe) menuItemId: string) {
    return this.inventory.getRecipes(user.tenantId, menuItemId);
  }

  @Put('recipes/:menuItemId')
  saveRecipe(
    @CurrentUser() user: AuthUser,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body() body: RecipeDto,
  ) {
    return this.inventory.saveRecipe(user, menuItemId, body);
  }
}
