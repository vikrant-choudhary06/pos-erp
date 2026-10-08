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
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KotStatus } from '@prisma/client';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { hasPermission } from '../common/permissions';
import { KitchenService } from './kitchen.service';

class StatusDto {
  @IsEnum(KotStatus)
  status: KotStatus;
}

class StationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;
}

class UpdateStationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class AssignDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  menuItemIds: string[];
}

@Controller()
export class KitchenController {
  constructor(private kitchen: KitchenService) {}

  @Get('kitchen/tickets')
  tickets(
    @CurrentUser() user: AuthUser,
    @Query('outletId', ParseUUIDPipe) outletId: string,
    @Query('stationId', new ParseUUIDPipe({ optional: true })) stationId?: string,
  ) {
    return this.kitchen.tickets(user, outletId, stationId);
  }

  @Patch('kitchen/tickets/:id')
  @HttpCode(204)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusDto,
  ) {
    // chefs move tickets along, waiters mark them served
    if (!hasPermission(user, 'kitchen.view') && !hasPermission(user, 'order.take')) {
      throw new ForbiddenException("You don't have access to this");
    }
    return this.kitchen.setStatus(user, id, body.status);
  }

  @Get('outlets/:outletId/stations')
  stations(@CurrentUser() user: AuthUser, @Param('outletId', ParseUUIDPipe) outletId: string) {
    return this.kitchen.listStations(user, outletId);
  }

  @Can('menu.manage')
  @Post('outlets/:outletId/stations')
  createStation(
    @CurrentUser() user: AuthUser,
    @Param('outletId', ParseUUIDPipe) outletId: string,
    @Body() body: StationDto,
  ) {
    return this.kitchen.createStation(user, outletId, body.name);
  }

  @Can('menu.manage')
  @Patch('stations/:id')
  updateStation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStationDto,
  ) {
    return this.kitchen.updateStation(user, id, body);
  }

  @Can('menu.manage')
  @Delete('stations/:id')
  @HttpCode(204)
  removeStation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.removeStation(user, id);
  }

  @Get('stations/:id/items')
  stationItems(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.stationItems(user, id);
  }

  @Can('menu.manage')
  @Put('stations/:id/items')
  @HttpCode(204)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignDto,
  ) {
    return this.kitchen.assignItems(user, id, body.menuItemIds);
  }
}
