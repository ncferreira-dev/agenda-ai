import {
  Controller,
  Headers,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';

// Webhook do Stripe. Precisa do corpo CRU pra validar a assinatura
// (NestFactory é criado com rawBody: true em main.ts).
@Controller('webhook/stripe')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
  ) {}

  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(req.rawBody as Buffer, signature);
    } catch (err) {
      this.logger.warn(`Assinatura inválida do webhook Stripe: ${(err as Error).message}`);
      return res.status(HttpStatus.BAD_REQUEST).send('assinatura inválida');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const appointmentId = session.metadata?.appointmentId;
      if (appointmentId) {
        // Idempotente: só age sobre o que ainda estava aguardando pagamento.
        const r = await this.prisma.appointment.updateMany({
          where: { id: appointmentId, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'PAID', status: 'CONFIRMED', paidAt: new Date() },
        });
        if (r.count) this.logger.log(`Sinal pago, agendamento confirmado: ${appointmentId}`);
      }
    }

    return res.json({ received: true });
  }
}
