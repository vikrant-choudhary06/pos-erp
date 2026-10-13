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
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { CreateStaffDto, RoleDto, UpdateStaffDto } from './dto';
import { StaffService } from './staff.service';

@Can('staff.manage')
@Controller()
export class StaffController {
  constructor(private staff: StaffService) {}

  @Get('staff')
  list(@CurrentUser() user: AuthUser) {
    return this.staff.list(user.tenantId);
  }

  @Post('staff')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateStaffDto) {
    return this.staff.create(user, body);
  }

  @Patch('staff/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStaffDto,
  ) {
    return this.staff.update(user, id, body);
  }

  @Delete('staff/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.remove(user, id);
  }

  @Get('roles')
  roles(@CurrentUser() user: AuthUser) {
    return this.staff.listRoles(user.tenantId);
  }

  @Post('roles')
  createRole(@CurrentUser() user: AuthUser, @Body() body: RoleDto) {
    return this.staff.createRole(user, body);
  }

  @Patch('roles/:id')
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RoleDto,
  ) {
    return this.staff.updateRole(user, id, body);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  removeRole(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.removeRole(user, id);
  }
}
