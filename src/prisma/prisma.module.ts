import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { criarExtensaoAuditoria } from './prisma-audit.extension';

// Global: o PrismaService fica disponível para injeção em qualquer módulo
// sem precisar reimportar este módulo em cada um.
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      // $extends devolve um CLIENT NOVO em vez de alterar o existente, então a
      // auditoria e o soft delete são plugados aqui, na criação da instância, e
      // não dentro da classe PrismaService — que continua servindo de tipo para
      // a injeção no app inteiro. Se isto fosse feito na classe, cada service
      // receberia o client sem extensão e a trilha ficaria vazia em silêncio.
      useFactory: () => {
        const prisma = new PrismaService();
        return prisma.$extends(criarExtensaoAuditoria(prisma));
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
