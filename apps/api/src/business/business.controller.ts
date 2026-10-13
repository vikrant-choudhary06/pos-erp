import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser, Can, CurrentUser } from '../auth/decorators';
import { BusinessService } from './business.service';
import { CreateOutletDto, UpdateBusinessDto, UpdateOutletDto } from './dto';

@Controller()
export class BusinessController {
  constructor(private business: BusinessService) {}

  @Get('business')
  get(@CurrentUser() user: AuthUser) {
    return this.business.getBusiness(user.tenantId);
  }

  @Can('outlet.manage')
  @Patch('business')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateBusinessDto) {
    return this.business.updateBusiness(user.tenantId, body);
  }

  @Get('outlets')
  outlets(@CurrentUser() user: AuthUser) {
    return this.business.listOutlets(user);
  }

  @Can('outlet.manage')
  @Post('outlets')
  createOutlet(@CurrentUser() user: AuthUser, @Body() body: CreateOutletDto) {
    return this.business.createOutlet(user.tenantId, body);
  }

  @Can('outlet.manage')
  @Patch('outlets/:id')
  updateOutlet(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateOutletDto,
  ) {
    return this.business.updateOutlet(user, id, body);
  }
}
