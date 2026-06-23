import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedOwner } from '../auth.service';

// Extrai o businessId do token (injetado pela JwtStrategy em req.user).
// Use sempre isto nos controllers do painel em vez de aceitar businessId do
// body/query — é o que garante que um dono nunca leia dados de outro negócio.
export const CurrentBusiness = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedOwner }>();
    return req.user.businessId;
  },
);

// Quando precisar do dono inteiro (ex.: tela "minha conta").
export const CurrentOwner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedOwner => {
    return ctx.switchToHttp().getRequest<{ user: AuthenticatedOwner }>().user;
  },
);
