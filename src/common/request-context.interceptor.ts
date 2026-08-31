import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { runWith, type TipoDeAtor } from './request-context';

// ---------------------------------------------------------------------------
// Abre o contexto de autoria para a requisição inteira, para que a trilha de
// auditoria saiba quem escreveu sem que nenhum service precise repassar autor.
//
// É INTERCEPTOR e não middleware, e o motivo é a ordem: middleware roda ANTES
// dos guards, e é o JwtAuthGuard que preenche req.user. Num middleware, toda
// escrita do painel seria gravada como SISTEMA.
// ---------------------------------------------------------------------------

interface RequisicaoComDono extends Request {
  user?: { ownerId?: string; businessId?: string };
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequisicaoComDono>();
    const ownerId = req.user?.ownerId;

    // A página pública mora sob /b/:slug. Distinguir CLIENTE de SISTEMA importa
    // porque são responsabilidades diferentes: um agendamento criado pelo
    // cliente e um criado pelo cron de lembrete não podem virar a mesma linha.
    const caminho = req.path ?? '';
    const ator: TipoDeAtor = ownerId ? 'OWNER' : caminho.startsWith('/b/') ? 'CLIENTE' : 'SISTEMA';

    // O await de quem escreve precisa acontecer DENTRO deste callback. Como o
    // Nest invoca o handler de rota dentro de next.handle(), o contexto vale
    // para toda a cadeia async da requisição.
    return runWith({ ownerId, businessId: req.user?.businessId, ator }, () => next.handle());
  }
}
