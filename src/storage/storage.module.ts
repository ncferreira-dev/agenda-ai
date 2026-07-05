import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// Global: o StorageService é infra compartilhada (usado pelo upload do painel e
// disponível pra qualquer módulo que precise persistir arquivo).
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
