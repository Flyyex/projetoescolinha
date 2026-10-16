# TRUCKAUTO — Plataforma de Frotas Autônomas

## What This Is

Plataforma web onde o "operador" adquire cotas de frotas autônomas (drones e pontos de carregamento) que geram rendimento diário creditado na carteira. O dinheiro entra por depósito Pix, fica dividido entre saldo de investimento e saldo de saque, e volta ao operador por saque Pix aprovado manualmente no painel admin. Tudo em português por padrão, com i18n próprio para PT/ES/EN/ZH. Monólito Node/Express servindo API + SPA mobile-first + painel admin + CRM.

## Core Value

**Nenhum real deve entrar ou sair da carteira sem que a plataforma saiba exatamente de quem é, quanto foi e por quê** — todo crédito e débito precisa ser rastreável, atômico e impossível de duplicar ou forjar.

## Requirements

### Validated

- ✓ Depósito Pix via gateway (MisticPay/SyncPay/Asaas/Cartpanda) com confirmação por webhook — existing
- ✓ Saque Pix com fila de aprovação manual no admin — existing
- ✓ Rendimento diário gotejado por contrato (24 fatias/dia, cron horário) — existing
- ✓ Carteira com saldos separados (investir / sacar) e taxa de saque — existing
- ✓ Plano de carreira multinível com comissão por nível e bônus de patente — existing
- ✓ Bônus de boas-vindas no cadastro, com expiração de 7 dias sem depósito — existing
- ✓ Limites nativos de saque/depósito com janela rolante de 24h, carência de conta nova e teto global — existing
- ✓ Anti-farm: hash de IP no cadastro, 4ª conta/24h vira suspeita, alerta Telegram — existing
- ✓ i18n PT/ES/EN/zh com modal global, fallback PT e cobertura de strings do app do operador — existing
- ✓ Painel admin com filtros e busca nas 6 listas operacionais — existing
- ✓ Testes unit (node --test) e e2e (Playwright) verdes no pipeline local — existing

### Active

- [ ] **SEC-01**: Nenhuma rota do CRM responde sem autenticação — hoje `routes/crm.js` é montado em `/api` sem nenhum middleware e `GET /api/settings` devolve `globalApiKey` e `adminPassword`
- [ ] **SEC-02**: Webhook de pagamento rejeita requisição quando o token não está configurado (fail-closed) — hoje o SyncPay credita saldo em POST anônimo se `SYNCPAY_WEBHOOK_TOKEN` estiver vazio
- [ ] **SEC-03**: Creditar saldo nunca duplica sob retry de webhook — hoje a idempotência é check-then-act e o INSERT da transação-guia vem depois do crédito
- [ ] **SEC-04**: Débito de saldo em saque é atômico — hoje `/withdraw` faz read-modify-write absoluto enquanto existe `claimWithdrawal` atômico que só protege a aprovação
- [ ] **SEC-05**: Pagamento de Pix não pode ser disparado duas vezes para a mesma transação — hoje existe flag `payoutSent`, mas a aprovação manual e o gateway automático são caminhos paralelos
- [ ] **SEC-06**: Depósito webhook nunca fica sem crédito por erro de validação — hoje `createUser` é chamada com `password` em vez de `passwordHash` e sem `inviteCode`, violando 2× NOT NULL e derrubando o webhook com 500
- [ ] **SEC-07**: Todo crédito e débito de saldo deixa rastro em `transactions` com origem, valor e causa

### Out of Scope

- Troca de gateway de pagamento ou addition de novos — o foco é integração correta dos que já existem
- Refatorar o monólito em serviços/módulos — dívida real, mas não bloqueia o trabalho de segurança
- Migrar `data.json` para Postgres obrigatório — o modo dual continua, mas com atomicidade declarada
- i18n do painel admin e do CRM — fora do v1 original, não é risco de segurança
- Chaves Pix / CPF únicos por conta (plano `plano-antifraude-bonus-R5.md`) — adiado por decisão anterior, revisão de produto pendente

## Context

**Ambiente técnico:**
- Monólito Node.js 18+ / Express, sem build step no frontend (vanilla JS servido de `public/`)
- Persistência **dual**: PostgreSQL quando `DATABASE_URL` existe, senão arquivo `data.json`. Ambos atrás da mesma API assíncrona em `database.js` com converters `mapX()`
- O modo `data.json` **não é transacional nem atômico** — cada escrita reescreve o arquivo inteiro. Incrementos `*Inc` e `claimWithdrawal` só são realmente atômicos no Postgres. Testar em `data.json` não valida comportamento de produção
- Deploy: Render (`render.yaml`), porta 10000, `trust proxy` ativado para o rate-limit ver IP real
- Auth: JWT em `middleware/auth.js`; admin por header `x-admin-key` comparado a `ADMIN_KEY` (que tem fallback inseguro `dev_apenas_adminkey_insegura` se a env var faltar)

**Trabalhos recentes (entregues):** limites nativos de saque/depósito (Fase 2 do plano antifraude), i18n completo do app do operador + colunas `*_es/en/zh` no catálogo, filtros no admin, alertas Telegram de segurança, testes unit e e2e.

**Pendências conhecidas de qualidade** (documentadas, fora do foco atual): mojibake gravado no schema (`DEFAULT 'DisponÃ­vel'`), ausência de ESLint/Prettier/`.editorconfig`, `admin.html` fora do i18n, arquivos gigantes sem build (`app.js` 2730 linhas, `admin.html` 2935, `database.js` 2095).

**Mapa do codebase:** `.planning/codebase/` (7 documentos, commit `2e62ded`).

## Constraints

- **Tech stack**: Sem introduzir framework novo, sem ORM, sem fila, sem Redis — o orçamento é o plano gratuito do Render e a equipe é de uma pessoa
- **Segurança**: Falha sempre fechada (fail-closed) — sistema sem segredo configurado **rejeita**, nunca aceita
- **Financeiro**: Nenhuma mudança pode permitir crédito de saldo sem depósito correspondente, nem débito acima do saldo
- **Compatibilidade**: Mudança de schema precisa funcionar nos dois backends (Postgres e `data.json`) e ser idempotente
- **Comunicação**: Aviso de saque, depósito e alerta de risco já via Telegram — canal existente para incidentes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Roadmap de segurança antes de feature | CRM sem auth e webhook aberto são holes **ativos** em produção, não dívida futura | — Pending |
| Proteger **todas** as rotas do CRM, não só as que vazam segredo | Whitelist parcial sempre deixa buraco no próximo endpoint adicionado | — Pending |
| Webhook fail-closed quando token ausente | Aceitar em dev foi considerado, mas o risco de config errada em produção é o custo dominante | — Pending |
| Roadmap coarse (4–5 fases) | Poucos blocos grandes fecham um tipo de risco inteiro de uma vez, menos ceremony | — Pending |
| Modo YOLO na execução | Confirmação a cada passo não agrega aqui; o gate que importa é o review do diff | — Pending |
| `data.json` segue existindo | Ambiente local sem custo; a atomicidade declarada por store é a mitigação | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-29 after initialization*
