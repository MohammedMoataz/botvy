import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createRequire } from 'node:module';
import type { PrismaClient as PrismaClientType } from '@prisma/client';

// @prisma/client ships CommonJS. Under ESM, Node's named-export detection
// finds `PrismaClient` in pnpm's symlinked dev layout but NOT in the
// container's flattened one, where `import { PrismaClient }` throws
// "does not provide an export named 'PrismaClient'" at startup. Requiring
// it explicitly works in both layouts; the type import above keeps the
// class fully typed.
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new () => PrismaClientType;
};

const PrismaBase = PrismaClient as unknown as new () => PrismaClientType;

@Injectable()
export class PrismaService extends PrismaBase implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
