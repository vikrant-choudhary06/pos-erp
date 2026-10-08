import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { CategoryDto, CreateItemDto, ModifierGroupDto, UpdateItemDto } from './dto';
import { MenuService } from './menu.service';

class UpdateCategoryDto extends PartialType(CategoryDto) {}

@Controller('menu')
export class MenuController {
  constructor(private menu: MenuService) {}

  @Get('categories')
  categories(@CurrentUser() user: AuthUser) {
    return this.menu.listCategories(user.tenantId);
  }

  @Can('menu.manage')
  @Post('categories')
  createCategory(@CurrentUser() user: AuthUser, @Body() body: CategoryDto) {
    return this.menu.createCategory(user.tenantId, body);
  }

  @Can('menu.manage')
  @Put('categories/order')
  @HttpCode(204)
  reorder(
    @CurrentUser() user: AuthUser,
    @Body('ids', new ParseArrayPipe({ items: String })) ids: string[],
  ) {
    return this.menu.reorderCategories(user.tenantId, ids);
  }

  @Can('menu.manage')
  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.menu.updateCategory(user.tenantId, id, body);
  }

  @Can('menu.manage')
  @Delete('categories/:id')
  @HttpCode(204)
  removeCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.removeCategory(user.tenantId, id);
  }

  @Get('items')
  items(
    @CurrentUser() user: AuthUser,
    @Query('categoryId', new ParseUUIDPipe({ optional: true })) categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.menu.listItems(user.tenantId, {
      categoryId,
      search: search?.trim() || undefined,
    });
  }

  @Can('menu.manage')
  @Post('items')
  createItem(@CurrentUser() user: AuthUser, @Body() body: CreateItemDto) {
    return this.menu.createItem(user.tenantId, body);
  }

  @Can('menu.manage')
  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.menu.updateItem(user, id, body);
  }

  @Can('menu.manage')
  @Delete('items/:id')
  @HttpCode(204)
  removeItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.removeItem(user.tenantId, id);
  }

  @Get('modifier-groups')
  modifierGroups(@CurrentUser() user: AuthUser) {
    return this.menu.listModifierGroups(user.tenantId);
  }

  @Can('menu.manage')
  @Post('modifier-groups')
  createModifierGroup(@CurrentUser() user: AuthUser, @Body() body: ModifierGroupDto) {
    return this.menu.createModifierGroup(user.tenantId, body);
  }

  @Can('menu.manage')
  @Put('modifier-groups/:id')
  updateModifierGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModifierGroupDto,
  ) {
    return this.menu.updateModifierGroup(user.tenantId, id, body);
  }

  @Can('menu.manage')
  @Delete('modifier-groups/:id')
  @HttpCode(204)
  removeModifierGroup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.removeModifierGroup(user.tenantId, id);
  }

  @Get('tax-groups')
  taxGroups(@CurrentUser() user: AuthUser) {
    return this.menu.listTaxGroups(user.tenantId);
  }
}
