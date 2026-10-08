import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { validateEnv } from './config';
import { CustomersModule } from './customers/customers.module';
import { DevicesModule } from './devices/devices.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { MailModule } from './mail/mail.module';
import { MenuModule } from './menu/menu.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ShiftsModule } from './shifts/shifts.module';
import { StaffModule } from './staff/staff.module';
import { TablesModule } from './tables/tables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    EventsModule,
    AuditModule,
    AuthModule,
    OnboardingModule,
    BusinessModule,
    StaffModule,
    MenuModule,
    TablesModule,
    InventoryModule,
    OrdersModule,
    KitchenModule,
    ShiftsModule,
    CustomersModule,
    ReportsModule,
    DevicesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
