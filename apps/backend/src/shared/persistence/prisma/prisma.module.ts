import { Global, Module } from '@nestjs/common';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';
import { PrismaService } from './prisma.service.js';

/**
 * The one Prisma client and the unit of work over it. Global for the same
 * reason the Mongo module is: Identity is the only context on PostgreSQL, but
 * the guards and the health probe need the client too, and both roles carry it.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      // The unit of work imports PrismaService as a type only, so Nest sees no
      // token on its constructor; the factory names the dependency explicitly.
      provide: PrismaUnitOfWork,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaUnitOfWork(prisma),
    },
  ],
  exports: [PrismaService, PrismaUnitOfWork],
})
export class PrismaModule {}
