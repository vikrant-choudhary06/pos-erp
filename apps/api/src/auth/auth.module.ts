import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionsService } from './sessions.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, OtpService, SessionsService],
  exports: [SessionsService],
})
export class AuthModule {}
