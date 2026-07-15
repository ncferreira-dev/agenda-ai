import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { isPlanId, type PlanId } from './plan-catalog';

// Nome da env de Price ID (Stripe) por plano. Os produtos no Stripe ficam com
// o PREÇO CHEIO (fullCents do catálogo) — desconto de lançamento é cupom
// digitado no próprio Checkout (allow_promotion_codes), nunca preço separado.
const PLAN_PRICE_ENV: Record<PlanId, string> = {
  START: 'STRIPE_PRICE_START',
  PRO: 'STRIPE_PRICE_PRO',
  ULTRA: 'STRIPE_PRICE_ULTRA',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new InternalServerErrorException(
      `Checkout indisponível: variável de ambiente ${name} não configurada.`,
    );
  }
  return value;
}

// Base pública do front (success/cancel url do Checkout). Mesmo fallback usado
// em src/auth/auth.controller.ts.
function webBase(): string {
  return process.env.WEB_ORIGIN ?? 'http://localhost:3001';
}

@Injectable()
export class StripeService {
  // Instanciado sob demanda: só exige STRIPE_SECRET_KEY quando o checkout é
  // de fato usado, não no boot da API (mesmo espírito de VAPID/SMTP no
  // .env.example — degrada com elegância em vez de derrubar o processo).
  private client: Stripe | null = null;

  constructor(private prisma: PrismaService) {}

  private stripe(): Stripe {
    if (!this.client) {
      this.client = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
    }
    return this.client;
  }

  /** Garante um stripe.Customer pro negócio; cria no 1º checkout, reaproveita depois. */
  private async ensureCustomerId(
    businessId: string,
    ownerEmail: string,
  ): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { stripeCustomerId: true, name: true },
    });
    if (business.stripeCustomerId) return business.stripeCustomerId;

    const customer = await this.stripe().customers.create({
      email: ownerEmail,
      name: business.name,
      metadata: { businessId },
    });
    await this.prisma.business.update({
      where: { id: businessId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /**
   * Cria a Checkout Session de assinatura (mode: subscription) e devolve a URL
   * pra onde o front redireciona o dono. `subscription_data.metadata` carrega
   * businessId+planId pra todo evento futuro do webhook (renovação, falha,
   * cancelamento) saber de qual negócio se trata, sem depender de
   * client_reference_id (que some após o 1º checkout).
   */
  async createCheckoutSessionUrl(params: {
    businessId: string;
    planId: string;
    ownerEmail: string;
  }): Promise<string> {
    if (!isPlanId(params.planId)) {
      throw new BadRequestException('Plano inválido.');
    }
    const priceId = requireEnv(PLAN_PRICE_ENV[params.planId]);
    const customerId = await this.ensureCustomerId(
      params.businessId,
      params.ownerEmail,
    );

    const base = webBase();
    const session = await this.stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: params.businessId,
      subscription_data: {
        metadata: { businessId: params.businessId, planId: params.planId },
      },
      success_url: `${base}/painel/planos?checkout=sucesso`,
      cancel_url: `${base}/painel/planos?checkout=cancelado`,
    });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe não devolveu a URL do Checkout.',
      );
    }
    return session.url;
  }

  /**
   * Verifica a assinatura do webhook e devolve o evento (ou lança 400 se a
   * assinatura for inválida/ausente). rawBody precisa vir intacto — ver
   * `rawBody: true` em main.ts.
   */
  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature) {
      throw new BadRequestException('Assinatura do webhook (stripe-signature) ausente.');
    }
    const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
    try {
      return this.stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(
        `Assinatura do webhook inválida: ${(err as Error).message}`,
      );
    }
  }
}
