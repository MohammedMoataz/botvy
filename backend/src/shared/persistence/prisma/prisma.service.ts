import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The Prisma client, and the only place in the codebase that constructs one.
 * Identity is the single context on PostgreSQL; every other context reaches it
 * through a query handler or an event, never through this.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    // Generation mode builds the application to read its decorators and has
    // no database to reach; connecting would only fail slowly.
    if (process.env.BOTVY_GEN) return;
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** `SELECT 1`, for the health endpoint. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * The transaction-scoped client Prisma hands an interactive `$transaction`.
 * Typed loosely on purpose: the generated client's transaction type is not
 * exported under a stable name across Prisma majors, and pinning to it here
 * would make a minor upgrade a compile error in every repository.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
