# Testar o sinal (Stripe) — Fase 5

O código do sinal está pronto e testado nos caminhos sem chave. Pra validar o
**fluxo de pagamento de verdade** (Checkout → pagar → confirmar), siga isto com
o Stripe em **modo teste**.

## 1. Chaves no `.env`

- **Secret key** (dashboard.stripe.com/test/apikeys → "Secret key", `sk_test_…`):

  ```
  STRIPE_SECRET_KEY="sk_test_..."
  ```

- **Webhook secret** — vem do `stripe listen` (passo 2), `whsec_…`:

  ```
  STRIPE_WEBHOOK_SECRET="whsec_..."
  ```

Reinicie o backend depois de preencher.

## 2. Encaminhar o webhook pro localhost

Em um terminal separado (instale o Stripe CLI: `brew install stripe/stripe-cli/stripe`):

```bash
stripe login
stripe listen --forward-to localhost:3000/webhook/stripe
```

Ele imprime o `whsec_…` — cole no `.env` (passo 1) e reinicie o backend.
**Deixe o `stripe listen` rodando.**

## 3. Ligar o sinal no negócio

Pelo painel (Fase 5 Etapa 2) ou direto:

```bash
node -e "const {PrismaClient}=require('./node_modules/@prisma/client');const p=new PrismaClient();(async()=>{await p.business.update({where:{slug:'barbearia-do-ze'},data:{requireDeposit:true,depositCents:2000}});console.log('sinal R\$20 ligado');await p.\$disconnect();})()"
```

## 4. Agendar e pagar

1. Abra `http://localhost:3001/barbearia-do-ze` e faça um agendamento.
   A resposta agora traz `checkoutUrl` (e o agendamento nasce **PENDING**).
2. Abra o `checkoutUrl`, pague com o cartão de teste:
   `4242 4242 4242 4242`, validade futura, CVC qualquer.
3. O `stripe listen` entrega `checkout.session.completed` → o backend marca o
   agendamento **PAID + CONFIRMED**. Confira no painel (`/painel`): o selo muda.

## 5. Hold que expira

Se não pagar em 15 min (`holdExpiresAt`), o cron (`PaymentsReleaseService`,
a cada 5 min) cancela o agendamento e **libera o horário**.

## Notas

- Conta **única da plataforma** (MVP): os sinais caem na sua conta Stripe. Pra
  repasse por salão (Stripe Connect), é evolução futura.
- Em produção, o webhook aponta pra `https://SEU_DOMINIO/webhook/stripe` e o
  `whsec_…` vem do endpoint cadastrado no dashboard, não do `stripe listen`.
