import { Module } from '@nestjs/common';
import { SuggestionService } from './suggestion.service';

// Sugestão de follow-up (IA + fallback por profissão). Sem dependências de
// banco — pode ser importado por quem precisar (painel) sem ciclo.
@Module({
  providers: [SuggestionService],
  exports: [SuggestionService],
})
export class SuggestionModule {}
