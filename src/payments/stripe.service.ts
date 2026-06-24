import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Wrapper do Stripe. Init preguiçoso: sem STRIPE_SECRET_KEY o app sobe normal;
// só o fluxo de sinal exige a chave. Conta única da plataforma (MVP).
// ---------------------------------------------------------------------------

@Injectable()
export class StripeService {
  private readonly client: Stripe | null;
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  private readonly webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3001';

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    this.client = key ? new Stripe(key) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  private require(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Pagamento indisponível: configure STRIPE_SECRET_KEY no servidor.',
      );
    }
    return this.client;
  }

  /** Abre o Checkout do sinal e devolve a URL + o id da sessão. */
  async createDepositCheckout(params: {
    appointmentId: string;
    slug: string;
    serviceName: string;
    depositCents: number;
  }): Promise<{ url: string; sessionId: string }> {
    const session = await this.require().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: params.depositCents,
            product_data: { name: `Sinal — ${params.serviceName}` },
          },
        },
      ],
      metadata: { appointmentId: params.appointmentId },
      success_url: `${this.webOrigin}/${params.slug}?pago=1`,
      cancel_url: `${this.webOrigin}/${params.slug}?pagamento=cancelado`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe não retornou a URL de pagamento.');
    }
    return { url: session.url, sessionId: session.id };
  }

  /** Valida a assinatura do webhook e devolve o evento. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.require().webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
