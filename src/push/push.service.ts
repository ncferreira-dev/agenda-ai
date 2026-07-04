import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Web Push pro dono. Init preguiçoso: sem VAPID_* o app sobe normal e o envio é
// no-op (igual ao MailService). Cada dispositivo que ativa o aviso vira uma
// PushSubscription escopada por businessId (multi-tenant). Endpoints mortos
// (404/410) são removidos sozinhos no envio.
// ---------------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // pra onde o clique leva (default: /painel)
}

// O que o navegador manda de volta ao assinar (PushSubscription.toJSON()).
export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  private readonly ready: boolean;

  constructor(private prisma: PrismaService) {
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (this.publicKey && priv) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:no-reply@agend.ai',
        this.publicKey,
        priv,
      );
      this.ready = true;
    } else {
      this.ready = false;
    }
  }

  get enabled(): boolean {
    return this.ready;
  }

  /** Chave pública VAPID pro cliente assinar. Null se não configurado. */
  getPublicKey(): string | null {
    return this.ready ? this.publicKey : null;
  }

  /** Registra (ou atualiza) a inscrição de um dispositivo do dono. */
  async saveSubscription(
    businessId: string,
    ownerId: string | null,
    sub: BrowserSubscription,
    userAgent?: string,
  ): Promise<void> {
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
    // endpoint é a chave natural do dispositivo. Se já existir, atualiza dono/chaves
    // e reescopa pro negócio atual (o mesmo device pode trocar de dono/negócio).
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        businessId,
        ownerId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
      update: {
        businessId,
        ownerId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    });
  }

  /** Remove a inscrição de um dispositivo (o dono desativou naquele aparelho). */
  async deleteSubscription(businessId: string, endpoint: string): Promise<void> {
    if (!endpoint) return;
    await this.prisma.pushSubscription.deleteMany({ where: { businessId, endpoint } });
  }

  /**
   * Dispara um push pra TODAS as inscrições do negócio. Best-effort:
   * falhas 404/410 (inscrição morta) são apagadas; outras só logam.
   */
  async notify(businessId: string, payload: PushPayload): Promise<void> {
    if (!this.ready) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { businessId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Push falhou (${status ?? '?'}): ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
