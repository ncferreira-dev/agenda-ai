# Plano de design — deixar o agend.ai com cara de profissional

> Baseado na análise do Codental (concorrente no nicho odonto) em 19/07/2026.
> Ideia: adotar PADRÕES, não copiar telas. Priorizado por impacto ÷ esforço.

---

## NÍVEL 1 — O que mais muda a percepção

### 1.1 Agenda em grade (semana/dia) — MAIOR IMPACTO
Hoje: lista de cartões. Eles: grade com dias nas colunas e horas nas linhas.
A grade comunica na hora o que a lista não comunica: onde tem buraco, onde
está cheio, quanto tempo cada atendimento ocupa.

Já estava no seu próprio roadmap (CLAUDE.md → "Agenda visual no painel").

Inclui: alternar **Semana / Dia**, botão **Hoje**, setas de navegação,
mini calendário do mês na lateral.

### 1.2 Estados vazios com ilustração
Hoje: espaço em branco / frase seca. Eles: desenho + frase explicando.
**Por que importa tanto no seu caso:** no primeiro dia a dona de salão vê
QUASE TODAS as telas vazias (sem clientes, sem agendamentos, sem faturamento).
É a primeira impressão dela do produto.

Telas que precisam: Agenda, Clientes, Faturamento, Serviços, Bloqueios.

### 1.3 Navegação enxuta (13 itens → 4)
Hoje o menu mistura uso diário (Agenda, Clientes, Serviços) com configuração
de uma vez na vida (Aparência, Planos, Perfil, Notificações, Negócio).

Proposta: **Agenda · Clientes · Financeiro · Configurações**
(o resto entra dentro de Configurações).

---

## NÍVEL 2 — Inteligência (o que separa de uma agenda comum)

### 2.1 Tela de Insights com JULGAMENTO, não só número
O padrão deles: `Comparecimento 100% — EXCELENTE — objetivo > 85%`.
O sistema já diz se está bom. Isso é o que faz parecer consultor.

Métricas que dá pra fazer com os dados que VOCÊ JÁ TEM:
- **Taxa de comparecimento** (COMPLETED vs NO_SHOW) ← o carro-chefe, é a dor do salão
- Agendamentos no período · Cancelamentos · Faltas
- Novos clientes no período
- Profissional que mais atendeu
- Dia da semana com mais movimento
- Serviço mais feito (já existe no CRM)
- Clientes sumidos (a segmentação já existe)

Detalhe deles que vale copiar: ícone **(?)** explicando cada métrica, e
"informações atualizadas a cada X minutos" (alinha expectativa).

### 2.2 "Quem eu chamo hoje" (retornos)
Equivalente ao "Pacientes sem Consultas" deles. Lista de clientes no prazo de
retorno (followUpDays) ou sumidos, cada um com o botão de WhatsApp pronto.
Já era pendência nossa — a análise confirmou que o padrão existe no mercado.

### 2.3 Gráfico de evolução no Faturamento
Hoje: números e listas. Eles: linha de entradas ao longo do ano + seletor de
período. Dá sensação de controle.

---

## NÍVEL 3 — Acabamento (barato, soma muito)

- Barra lateral **recolhível** (mais espaço pra grade)
- **Cabeçalho dos dias fixo** ao rolar as horas
- **Fim de semana com fundo diferente**
- **Linha marcando a hora atual** na grade
- **Fuso horário no rodapé** (relevante: seu produto é multi-fuso)
- Mostrar só a **faixa de horário de funcionamento**, não 0h-23h

---

## Ordem sugerida

**Opção A (ganho rápido):** 1.3 navegação + 1.2 estados vazios.
Pouco código, resultado visível na hora. Bom se quer melhorar já pro teste
da sua amiga.

**Opção B (o grande salto):** 1.1 agenda em grade.
É o que realmente muda a percepção, mas é o maior trabalho.

**Opção C (diferencial):** 2.1 Insights.
Nenhum concorrente de salão pequeno faz bem. Usa dados que já existem.

> Recomendação: A primeiro (rápido, arruma a primeira impressão), depois B.
