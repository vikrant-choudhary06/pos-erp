import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { hasPermission } from '../common/permissions';
import {
  AddItemsDto,
  CreateOrderDto,
  DiscountDto,
  OptionalReasonDto,
  PayDto,
  ReasonDto,
  UpdateItemDto,
  UpdateOrderDto,
} from './dto';
import { OrdersService } from './orders.service';
import { PosMenuService } from './pos-menu.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller()
export class OrdersController {
  constructor(
    private orders: OrdersService,
    private posMenu: PosMenuService,
  ) {}

  @Get('pos/menu')
  menu(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.posMenu.menu(user, outletId);
  }

  @Put('pos/menu/:menuItemId/stock')
  @HttpCode(204)
  setStock(
    @CurrentUser() user: AuthUser,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body('outletId', ParseUUIDPipe) outletId: string,
    @Body('outOfStock', ParseBoolPipe) outOfStock: boolean,
  ) {
    // the kitchen usually knows first when something runs out
    if (!hasPermission(user, 'menu.manage') && !hasPermission(user, 'kitchen.view')) {
      throw new ForbiddenException("You don't have access to this");
    }
    return this.posMenu.setOutOfStock(user, outletId, menuItemId, outOfStock);
  }

  @Get('orders/active')
  active(@CurrentUser() user: AuthUser, @Query('outletId', ParseUUIDPipe) outletId: string) {
    return this.orders.active(user, outletId);
  }

  @Can('reports.view')
  @Get('orders')
  history(
    @CurrentUser() user: AuthUser,
    @Query('outletId', new ParseUUIDPipe({ optional: true })) outletId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status', new ParseEnumPipe(OrderStatus, { optional: true })) status?: OrderStatus,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
  ) {
    return this.orders.history(user, {
      outletId,
      from: from && DATE.test(from) ? from : undefined,
      to: to && DATE.test(to) ? to : undefined,
      status,
      search,
      page: Math.max(page, 1),
    });
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user, id);
  }

  @Can('order.take')
  @Post('orders')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOrderDto) {
    return this.orders.create(user, body);
  }

  @Can('order.take')
  @Patch('orders/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateOrderDto,
  ) {
    return this.orders.update(user, id, body);
  }

  @Can('order.take')
  @Post('orders/:id/items')
  addItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddItemsDto,
  ) {
    return this.orders.addItems(user, id, body);
  }

  @Can('order.take')
  @Patch('orders/:id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.orders.updateItem(user, id, itemId, body);
  }

  @Can('order.take')
  @Post('orders/:id/items/:itemId/cancel')
  @HttpCode(200)
  cancelItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: OptionalReasonDto,
  ) {
    return this.orders.cancelItem(user, id, itemId, body.reason);
  }

  @Can('order.take')
  @Post('orders/:id/kot')
  sendKot(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.sendKot(user, id);
  }

  @Can('bill.discount')
  @Put('orders/:id/discount')
  setDiscount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DiscountDto,
  ) {
    return this.orders.setDiscount(user, id, body);
  }

  @Can('bill.discount')
  @Delete('orders/:id/discount')
  removeDiscount(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.removeDiscount(user, id);
  }

  @Can('bill.settle')
  @Post('orders/:id/bill')
  @HttpCode(200)
  bill(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.bill(user, id);
  }

  @Can('bill.void')
  @Post('orders/:id/reopen')
  @HttpCode(200)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
  ) {
    return this.orders.reopen(user, id, body.reason);
  }

  @Can('bill.settle')
  @Post('orders/:id/payments')
  @HttpCode(200)
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PayDto) {
    return this.orders.pay(user, id, body);
  }

  // empty orders can be dropped by the waiter, the service checks the rest
  @Can('order.take')
  @Post('orders/:id/void')
  @HttpCode(200)
  void(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
  ) {
    return this.orders.void(user, id, body.reason);
  }
}
