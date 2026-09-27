import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { ClockService } from './common/clock.service';
import { CryptoService } from './common/crypto.service';
import { CsrfMiddleware } from './common/csrf.middleware';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { PrismaService } from './common/prisma.service';
import { AppConfig } from './config/app-config';
import { AppointmentsController, PatientsController } from './modules/appointments/appointments.controller';
import { AppointmentsService } from './modules/appointments/appointments.service';
import { AuditController } from './modules/audit/audit.controller';
import { AuditService } from './modules/audit/audit.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { GoogleOidcService } from './modules/auth/google-oidc.service';
import { JwtAuthGuard, RolesGuard } from './modules/auth/guards';
import { TokenService } from './modules/auth/token.service';
import { AvailabilityController } from './modules/availability/availability.controller';
import { AvailabilityService } from './modules/availability/availability.service';
import { HealthController } from './modules/health.controller';
import { RealtimeGateway } from './modules/realtime/realtime.gateway';
import { SettingsController } from './modules/settings/settings.controller';
import { SettingsService } from './modules/settings/settings.service';
import { SlotsController } from './modules/slots/slots.controller';
import { SlotsService } from './modules/slots/slots.service';
import { UsersController } from './modules/users/users.controller';
import { UsersService } from './modules/users/users.service';

@Global()
@Module({
  providers: [AppConfig, PrismaService, ClockService, CryptoService],
  exports: [AppConfig, PrismaService, ClockService, CryptoService],
})
class CoreModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env')] }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    JwtModule.register({}),
    CoreModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    SettingsController,
    AuditController,
    SlotsController,
    AvailabilityController,
    AppointmentsController,
    PatientsController,
  ],
  providers: [
    TokenService,
    GoogleOidcService,
    AuthService,
    UsersService,
    SettingsService,
    AuditService,
    SlotsService,
    AvailabilityService,
    AppointmentsService,
    RealtimeGateway,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*path');
  }
}
