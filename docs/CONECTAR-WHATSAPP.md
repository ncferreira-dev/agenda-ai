# Conectar o WhatsApp (Cloud API) — Fase 4, Etapa 2

Guia pra ligar o número de WhatsApp ao agente. Tudo o que é código já está pronto
(webhook, agente, confirmação SIM/NÃO). Aqui é **configuração** — a maior parte é
no painel da Meta + subir um túnel.

Pré-requisitos:
- Conta no **Meta for Developers** (developers.facebook.com).
- Uma **`ANTHROPIC_API_KEY`** (console.anthropic.com) pro agente responder.
- Backend rodando em `localhost:3000` (`npm run start:dev`).

---

## Passo 1 — Subir o túnel (cloudflared)

A Meta precisa de uma URL **pública** pra chamar o webhook. O `cloudflared` cria
uma na hora, sem conta:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

Ele imprime uma URL tipo `https://algo-aleatorio.trycloudflare.com`. **Deixe rodando.**
Seu webhook é essa URL + `/webhook/whatsapp`, ex.:

```
https://algo-aleatorio.trycloudflare.com/webhook/whatsapp
```

> A URL do quick-tunnel muda a cada vez que você sobe. Se reiniciar o cloudflared,
> reconfigure a Callback URL na Meta (Passo 3).

---

## Passo 2 — App e número na Meta

1. developers.facebook.com → **Criar app** → tipo **Business** (Empresa).
2. Adicione o produto **WhatsApp**.
3. Em **WhatsApp → API Setup** (Configuração da API) você recebe:
   - um **número de teste** (a Meta fornece um),
   - um **token de acesso temporário** (vale ~24h) → vira `WHATSAPP_TOKEN`,
   - um **Phone number ID** → vira `WHATSAPP_PHONE_NUMBER_ID`.
4. Ainda nessa tela, em **"To"**, adicione o **seu WhatsApp pessoal** como destinatário
   de teste (a Meta manda um código de verificação).

> O token de 24h é só pra testar. Pra durar, crie um **System User** com token
> permanente (Business Settings → Users → System Users) — deixe pra quando for pra valer.

---

## Passo 3 — Configurar o webhook na Meta

1. **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL**: a URL do Passo 1 (`https://…/webhook/whatsapp`).
3. **Verify token**: invente uma string (ex.: `meu-token-secreto-123`). Ela tem que
   ser **idêntica** à `WHATSAPP_VERIFY_TOKEN` do seu `.env` (Passo 4).
4. Clique **Verify and Save**. A Meta faz um GET no webhook; nosso backend confere o
   token e responde o desafio. Se der erro, confira que o backend está no ar e que o
   token bate.
5. Em **Webhook fields**, clique **Subscribe** no campo **`messages`**.

---

## Passo 4 — Preencher o `.env` e reiniciar

No `.env` do backend, preencha:

```
WHATSAPP_TOKEN="EAAG... (o token do Passo 2)"
WHATSAPP_PHONE_NUMBER_ID="123456789 (o Phone number ID do Passo 2)"
WHATSAPP_VERIFY_TOKEN="meu-token-secreto-123 (igual ao Passo 3)"
WHATSAPP_APP_SECRET="a Chave Secreta do App (Meta > App > Configurações > Básico)"
ANTHROPIC_API_KEY="sk-ant-... (pro agente responder)"
```

Reinicie o backend (`Ctrl-C` e `npm run start:dev`). Dica: preencha o
`WHATSAPP_VERIFY_TOKEN` **antes** do Passo 3, senão a verificação falha.

**Sobre a `WHATSAPP_APP_SECRET`:** é ela que valida a assinatura HMAC que a Meta
põe em todo webhook. Sem ela, o endpoint aceitaria POST forjado de qualquer
origem — e aí qualquer um faria o agente criar ou cancelar agendamento no seu
banco. Por isso **em produção a API recusa o webhook enquanto ela estiver
vazia**; em dev ela passa, com um aviso no log.

**Em produção (Render):** as cinco variáveis acima estão declaradas no
`render.yaml` como `sync: false` — ou seja, aparecem no dashboard esperando
valor. Preencha em *Environment*, não no git.

---

## Passo 5 — Apontar o número ao negócio (roteamento multi-tenant)

O sistema descobre de qual negócio é a mensagem pelo **número que recebeu**
(`business.phone` == número de teste da Meta). Ajuste o `phone` da Barbearia pro
número de teste (só dígitos, com DDI):

```bash
node -e "const {PrismaClient}=require('./node_modules/@prisma/client');const p=new PrismaClient();(async()=>{await p.business.update({where:{slug:'barbearia-do-ze'},data:{phone:'NUMERO_DE_TESTE_SO_DIGITOS'}});console.log('phone atualizado');await p.\$disconnect();})()"
```

O formato é **só dígitos, com DDI e sem `+`** — ex.: `5511999990000`. Não precisa
mais adivinhar o formato exato que a Meta manda: o webhook normaliza o número
que chega (tira `+`, espaço e hífen, e completa o `55` quando falta) antes de
procurar o negócio, então basta gravar no padrão acima — o mesmo que o painel e
a página pública já usam.

Se ainda assim não casar, mande uma mensagem pro número e olhe o log: aparece
`Webhook: nenhum negócio com phone="…"` com o valor **já normalizado** que ele
procurou.

> **Limitação de hoje, importante saber antes de vender pro segundo cliente:**
> `WHATSAPP_PHONE_NUMBER_ID` é uma variável única do processo — existe **um**
> número de WhatsApp pra instalação inteira. O roteamento por `business.phone`
> funciona, mas na prática só um negócio pode estar ligado por vez. Atender
> vários negócios em números diferentes exige guardar as credenciais por
> negócio, o que ainda não existe no schema.

---

## Passo 6 — Testar de ponta a ponta

1. Do seu WhatsApp, mande pro número de teste: **"oi, queria cortar o cabelo amanhã de tarde"**.
2. O agente responde, consulta a agenda real e marca. O agendamento aparece no painel
   (`/painel`) e no banco.
3. **Confirmação SIM/NÃO**: quando um lembrete sair (cron, 24h antes), responda **SIM**
   → confirma na hora; qualquer outra coisa → o agente abre remarcação. (A lógica já
   está testada; ao vivo depende de um agendamento entrar na janela de lembrete.)

---

## Trocar de provider (opcional, futuro)

Pra usar Evolution/Z-API em vez da Cloud API oficial: implemente a interface
`WhatsAppProvider` (`src/whatsapp/whatsapp.provider.ts`) e troque o provider no
módulo. Nada mais muda.
