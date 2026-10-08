import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { AreaDto, BulkTablesDto, TableDto } from './dto';
import { TablesService } from './tables.service';

class UpdateAreaDto extends PartialType(AreaDto) {}
class UpdateTableDto extends PartialType(TableDto) {}

@Controller()
export class TablesController {
  constructor(private tables: TablesService) {}

  @Get('outlets/:outletId/floor')
  floor(@CurrentUser() user: AuthUser, @Param('outletId', ParseUUIDPipe) outletId: string) {
    return this.tables.floor(user, outletId);
  }

  @Can('tables.manage')
  @Post('outlets/:outletId/areas')
  createArea(
    @CurrentUser() user: AuthUser,
    @Param('outletId', ParseUUIDPipe) outletId: string,
    @Body() body: AreaDto,
  ) {
    return this.tables.createArea(user, outletId, body);
  }

  @Can('tables.manage')
  @Patch('areas/:id')
  updateArea(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAreaDto,
  ) {
    return this.tables.updateArea(user, id, body);
  }

  @Can('tables.manage')
  @Delete('areas/:id')
  @HttpCode(204)
  removeArea(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.removeArea(user, id);
  }

  @Can('tables.manage')
  @Post('outlets/:outletId/tables')
  createTable(
    @CurrentUser() user: AuthUser,
    @Param('outletId', ParseUUIDPipe) outletId: string,
    @Body() body: TableDto,
  ) {
    return this.tables.createTable(user, outletId, body);
  }

  @Can('tables.manage')
  @Post('outlets/:outletId/tables/bulk')
  createMany(
    @CurrentUser() user: AuthUser,
    @Param('outletId', ParseUUIDPipe) outletId: string,
    @Body() body: BulkTablesDto,
  ) {
    return this.tables.createMany(user, outletId, body);
  }

  @Can('tables.manage')
  @Patch('tables/:id')
  updateTable(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTableDto,
  ) {
    return this.tables.updateTable(user, id, body);
  }

  @Can('tables.manage')
  @Delete('tables/:id')
  @HttpCode(204)
  removeTable(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.removeTable(user, id);
  }
}
