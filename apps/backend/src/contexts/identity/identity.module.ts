import { Module } from '@nestjs/common';
import { ServiceTokenGuard } from '../../shared/auth/service-token.guard.js';
import { PrismaService } from '../../shared/persistence/prisma/prisma.service.js';
import { DeviceRepository } from './domain/device.repository.js';
import { IdentityOutboxRepository } from './domain/identity-outbox.repository.js';
import { PASSWORD_HASHER } from './domain/password-hasher.js';
import { ServiceClientRepository } from './domain/service-client.repository.js';
import { RefreshTokenRepository } from './domain/refresh-token.repository.js';
import { UserRepository } from './domain/user.repository.js';
import { ChangePasswordHandler } from './features/change-password/change-password.handler.js';
import { RefreshHandler } from './features/refresh/refresh.handler.js';
import { RegisterHandler } from './features/register/register.handler.js';
import { DevicesQueryHandler } from './features/devices/devices.query.js';
import { SignInHandler } from './features/sign-in/sign-in.handler.js';
import { AdminSeedService } from './features/seeds/admin-seed.service.js';
import { IdentityBootstrap } from './features/seeds/identity.bootstrap.js';
import { ServiceClientSeedService } from './features/seeds/service-client-seed.service.js';
import {
  PrismaDeviceRepository,
  PrismaIdentityOutboxRepository,
  PrismaRefreshTokenRepository,
  PrismaServiceClientRepository,
  PrismaUserRepository,
} from './infrastructure/prisma-identity.repositories.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password.hasher.js';

/**
 * Identity & Access: the one context on PostgreSQL. Every port declared in
 * domain/ is bound here to its Prisma adapter, and nothing outside this module
 * ever sees the client — the guards and the alerts slice reach the tables
 * through these ports and the DevicesQuery, which is what constitution I means
 * by "each context owns its store".
 */
@Module({
  providers: [
    {
      provide: IdentityOutboxRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaIdentityOutboxRepository(prisma),
    },
    {
      provide: UserRepository,
      inject: [PrismaService, IdentityOutboxRepository],
      useFactory: (prisma: PrismaService, outbox: IdentityOutboxRepository) =>
        new PrismaUserRepository(prisma, outbox),
    },
    {
      provide: ServiceClientRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaServiceClientRepository(prisma),
    },
    {
      provide: DeviceRepository,
      inject: [PrismaService, IdentityOutboxRepository],
      useFactory: (prisma: PrismaService, outbox: IdentityOutboxRepository) =>
        new PrismaDeviceRepository(prisma, outbox),
    },
    {
      provide: RefreshTokenRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaRefreshTokenRepository(prisma),
    },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    AdminSeedService,
    ServiceClientSeedService,
    IdentityBootstrap,
    DevicesQueryHandler,
    SignInHandler,
    ChangePasswordHandler,
    RegisterHandler,
    RefreshHandler,
    ServiceTokenGuard,
  ],
  // `UserRepository` and `DeviceRepository` are deliberately *not* exported.
  // They are Identity's own store access, and exporting them let another
  // context inject one and read Identity's tables directly — which Operations
  // did. What leaves this module is the query handler, the credential guard,
  // and the outbox repository the relay's forwarder needs.
  exports: [
    ServiceClientRepository,
    IdentityOutboxRepository,
    DevicesQueryHandler,
    SignInHandler,
    ChangePasswordHandler,
    RegisterHandler,
    RefreshHandler,
    ServiceTokenGuard,
  ],
})
export class IdentityModule {}
