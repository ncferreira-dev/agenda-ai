import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global: o PrismaService fica disponível para injeção em qualquer módulo
// sem precisar reimportar este módulo em cada um.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
