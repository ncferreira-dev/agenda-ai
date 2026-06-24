import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// Libera horários cujo sinal não foi pago dentro da janela (holdExpiresAt).
// Cancelar solta o slot — o motor de disponibilidade ignora CANCELLED.
@Injectable()
export class PaymentsReleaseService {
  private readonly logger = new Logger(PaymentsReleaseService.name);

  @Cron('0 */5 * * * *') // a cada 5 min
  async releaseExpiredHolds() {
    const r = await this.prisma.appointment.updateMany({
      where: {
        paymentStatus: 'PENDING',
        status: 'PENDING',
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: 'CANCELLED' },
    });
    if (r.count) this.logger.log(`Sinais não pagos — horários liberados: ${r.count}`);
  }

  constructor(private prisma: PrismaService) {}
}
