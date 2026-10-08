import { Global, Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';

@Global()
@Module({
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
