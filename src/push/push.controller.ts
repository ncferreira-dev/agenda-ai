import { Body, Controller, Delete, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingGateGuard } from '../billing/billing-gate.guard';
import { CurrentBusiness, CurrentOwner } from '../auth/decorators/current-business.decorator';
import type { AuthenticatedOwner } from '../auth/auth.service';
import { PushService, type BrowserSubscription } from './push.service';

// Endpoints de Web Push do painel. Protegidos por JWT; o dono só mexe nas
// inscrições do próprio negócio (businessId vem do token, nunca do body).
@Controller('me/push')
@UseGuards(JwtAuthGuard, BillingGateGuard)
export class PushController {
  constructor(private push: PushService) {}

  /** Chave pública VAPID pro navegador assinar. { publicKey: null } = push desligado. */
  @Get('vapid')
  vapid() {
    return { publicKey: this.push.getPublicKey() };
  }

  /** Registra a inscrição deste dispositivo. */
  @Post('subscriptions')
  subscribe(
    @CurrentBusiness() businessId: string,
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() body: { subscription?: BrowserSubscription },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push
      .saveSubscription(businessId, owner.ownerId, body?.subscription as BrowserSubscription, userAgent)
      .then(() => ({ ok: true }));
  }

  /** Remove a inscrição deste dispositivo. */
  @Delete('subscriptions')
  unsubscribe(
    @CurrentBusiness() businessId: string,
    @Body() body: { endpoint?: string },
  ) {
    return this.push.deleteSubscription(businessId, body?.endpoint ?? '').then(() => ({ ok: true }));
  }
}
