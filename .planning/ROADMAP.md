# Roadmap — TRUCKAUTO Hardening de Segurança

**Project:** TRUCKAUTO — Plataforma de Frotas Autônomas
**Created:** 2026-09-29
**Granularity:** Coarse (4–5 fases, 1–3 planos cada)
**Status:** Aguardando aprovação

---

## Visão

Fechar, por ordem de dano, os holes que estão **ativos em produção** antes de construir qualquer feature nova. Cada fase elimina uma classe inteira de risco e é verificável por comportamento observável.

**Total:** 5 fases | 14 requirements | 100% das v1 cobertas

| # | Fase | Goal | Requirements | Critérios |
|---|---|---|---|---|
| 1 | Fechar superfície exposta | Nenhum endpoint sem auth | SEC-01, SEC-02 | 5 |
| 2 | Webhook à prova de fraude e replay | Nenhum crédito sem evento válido e único | SEC-03, SEC-04, SEC-05 | 5 |
| 3 | Saldo e saque atômicos | Nenhum débito acima do saldo, nenhum saque duplicado | SEC-06, SEC-07, SEC-08 | 5 |
| 4 | Chave Pix e CPF exclusivos | Uma chave, uma conta | SEC-09, SEC-10 | 4 |
| 5 | Rastreio, fail-closed e alertas | Todo movimento tem causa; falha é fechada; incidente é reportado | SEC-11, SEC-12, SEC-13, SEC-14 | 5 |

---

## Phase 1: Fechar a superfície exposta

**Goal:** Nenhuma rota do CRM ou pública responde sem credencial válida, e nenhuma resposta expõe segredo.
**Mode:** mvp
**Requirements:** SEC-01, SEC-02
**Success Criteria:**
1. `GET /api/settings` sem `x-admin-key` válido responde 401/403 e não retorna `globalApiKey` nem `adminPassword`
2. `GET /api/leads` sem credencial não retorna nenhum PII
3. `POST /api/whatsapp/send` sem credencial é rejeitado e nenhum envio acontece
4. Todo handler em `routes/crm.js` está coberto por um middleware de auth, verificado por teste que percorre as rotas registradas
5. A rota de webhook do gateway continua acessível pelo segredo próprio, sem depender do admin key

**Riscos:** o CRM consome suas próprias rotas internamente (ex: `routes/crm.js` chama o watcher de saque). Proteger na montagem pode quebrar fluxo interno — mapear os call sites antes de aplicar middleware.

---

## Phase 2: Webhook à prova de fraude e replay

**Goal:** Nenhum POST anônimo credita saldo, e o mesmo evento processado duas vezes credita uma só vez.
**Requirements:** SEC-03, SEC-04, SEC-05
**Success Criteria:**
1. Com o token do provider não configurado, o webhook responde 401 e **não** cria transação nem altera saldo
2. Enviar o mesmo payload duas vezes resulta em um único crédito; a segunda devolve o resultado anterior sem creditar
3. A marca de idempotência é persistida antes do crédito, em operação atômica
4. Um webhook cujo `createUser` falha por validação interna não deixa o depósito sem crédito — a transação é registrada como pendente e reprocessável
5. Existe teste automatizado para replay em cada um dos quatro gateways ativos

**Riscos:** o Asaas hoje consulta `getTransactionsByUserId().some()`, janela de idempotência muito maior que a dos outros. Migrar para marca persistida muda o comportamento de reprocessamento — testar com webhook real em sandbox.

---

## Phase 3: Saldo e saque atômicos

**Goal:** Nenhuma requisição de saque consegue debitar mais que o saldo disponível, e a aprovação nunca reabre um Pix já enviado.
**Requirements:** SEC-06, SEC-07, SEC-08
**Success Criteria:**
1. `/withdraw` usa incremento condicional atômico; saldo insuficiente retorna erro sem saldo negativo
2. Duas requisições concorrentes de saque resultam em uma só aprovação
3. Nenhum caminho de aprovação reverte `payoutSent` para `pending` uma vez que o Pix saiu
4. O comportamento é **idêntico** nos dois backends, ou a diferença está documentada e exposta (o modo `data.json` não é transacional)
5. Teste de concorrência prova que a soma dos débitos nunca excede o saldo inicial

**Riscos:** o modo `data.json` reescreve o arquivo inteiro a cada escrita. Atomicidade real só existe no Postgres. A decisão é declarar e isolar essa diferença, não fingir que os dois stores se comportam igual.

---

## Phase 4: Chave Pix e CPF exclusivos

**Goal:** Uma chave Pix pertence a uma conta; CPF de saque bate com o cadastro.
**Requirements:** SEC-09, SEC-10
**Success Criteria:**
1. Segunda conta tentando sacar com a mesma chave Pix normalizada é recusada com erro explícito
2. Saque com `pixKeyType: CPF` onde a chave difere do CPF do cadastro é recusado
3. A verificação roda antes de qualquer alteração de saldo
4. A normalização de chave trata telefone com/sem nono dígito como a mesma chave
5. Teste cobre as duas regras com as duas variantes de CPF já existentes na base

**Nota:** esta fase entrega a parte que não depende de migração de cadastro. Tornar o CPF **obrigatório no cadastro** (Fase 1 do `plano-antifraude-bonus-R5.md`) continua v2 — exige limpeza da base antes de ativar `UNIQUE`.

---

## Phase 5: Rastreio, fail-closed e alertas

**Goal:** Todo movimento de saldo tem causa registrada, sistema sem segredo não sobe, e incidente chega no Telegram.
**Requirements:** SEC-11, SEC-12, SEC-13, SEC-14
**Success Criteria:**
1. Todo crédito e débito produz registro em `transactions` com tipo, valor, origem e causa
2. Operação recusada por regra de negócio não deixa resíduo parcial no saldo nem registro fantasma
3. `NODE_ENV=production` sem `ADMIN_KEY` impede o boot do servidor
4. Chegar alerta no Telegram quando: teto global de 24h é atingido, conta entra em quarentena, webhook rejeita por token ausente
5. A origem registrada no rastro é confiável (webhook, manual, ou cron) e não vem de campo enviado pelo cliente

---

## Fora do roadmap

- Refatoração do monólito
- Troca de gateway
- i18n do admin/CRM
- Ferramental de qualidade (ESLint/Prettier)
- Correção do mojibake no schema
- Troca da auth legada da MisticPay (expira 30/09/2026 — tratar à parte, é prazo externo)

---
*Roadmap criado: 2026-09-29*
