import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Cliente Prisma compartilhado. É injetado em todos os services e é o único
// ponto de acesso ao banco. Todas as queries são escopadas por businessId
// (regra de ouro 1) — este service não escopa nada sozinho.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
