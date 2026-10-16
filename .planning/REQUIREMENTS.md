# Requirements — TRUCKAUTO Hardening de Segurança

**Project:** TRUCKAUTO — Plataforma de Frotas Autônomas
**Defined:** 2026-09-29
**Status:** v1 em planejamento

---

## Contexto

Ciclo focado em **blindar segurança**. As requirements abaixo atacam os riscos confirmados na auditoria do codebase (`.planning/codebase/CONCERNS.md`), que rodou sobre o código em produção.

---

## v1 Requirements

### Superfície exposta

- [ ] **SEC-01**: `routes/crm.js` é montado em `/api` sem nenhum middleware de autenticação. `GET /api/settings` devolve `globalApiKey` e `adminPassword` em texto claro; `GET /api/leads` expõe PII (nome, telefone, e-mail, documento); `POST /api/whatsapp/send` envia mensagem arbitrária para qualquer número; `POST /api/leads/webhook` cria lead sem verificação de origem. Toda rota do CRM — exceto o webhook do gateway, que tem auth própria — exige credencial válida
- [ ] **SEC-02**: Endpoint de health ou qualquer rota pública não revela segredo, chave ou configuração interna

### Integridade de webhook

- [ ] **SEC-03**: Webhook de pagamento responde 401/403 e **não credita saldo** quando o token do provider não está configurado. A validação de assinatura não pode estar dentro do `if` que checa a existência do segredo
- [ ] **SEC-04**: Replay do mesmo evento de webhook duas vezes não credita saldo duas vezes. A marca de idempotência é persistida **antes** do crédito, em operação única
- [ ] **SEC-05**: Depósito recebido por webhook nunca fica sem crédito por erro de validação interna. `createUser` chamada de webhook passa `passwordHash` e `inviteCode` válidos, satisfazendo as colunas `NOT NULL` do Postgres

### Integridade de saldo

- [ ] **SEC-06**: Débito de saldo em saque é atômico. `/withdraw` não faz mais read-modify-write absoluto de `earnBalance`; usa incremento condicional que falha se o saldo for insuficiente
- [ ] **SEC-07**: Duas requisições de saque simultâneas para a mesma conta não geram duas saques válidas
- [ ] **SEC-08**: Aprovação de saque não pode reverter para `pending` depois que o Pix foi enviado. O `payoutSent` é respeitado em todos os caminhos de aprovação

### Saque único

- [ ] **SEC-09**: Uma chave Pix não pode ser usada em saques de duas contas diferentes
- [ ] **SEC-10**: Chave Pix do tipo CPF tem que ser igual ao CPF do cadastro da conta

### Rastreabilidade

- [ ] **SEC-11**: Todo crédito e débito de saldo produz um registro em `transactions` com tipo, valor, origem (gateway/manual/cron) e causa
- [ ] **SEC-12**: Tentativa de crédito ou débito recusada por regra de negócio não deixa resíduo parcial no saldo

### Operação segura

- [ ] **SEC-13**: `ADMIN_KEY` sem valor definido em `NODE_ENV=production` impede o boot do servidor em vez de cair no fallback `dev_apenas_adminkey_insegura`
- [ ] **SEC-14**: Alerta no Telegram quando o teto global de saques de 24h é atingido, quando uma conta entra em quarentena e quando o webhook rejeita por token ausente

---

## v2 Requirements (deferred)

- [ ] CPF obrigatório e único por conta (`plano-antifraude-bonus-R5.md`)
- [ ] CPF do depósito = CPF do cadastro
- [ ] Detecção de dispositivo além do IP no cadastro
- [ ] i18n do painel admin e do CRM
- [ ] ESLint + Prettier + `.editorconfig` (hoje zero ferramental de qualidade)
- [ ] Corrigir mojibake gravado no schema (`DEFAULT 'DisponÃ­vel'`)
- [ ] Trocar a auth legada `ci`/`cs` da MisticPay (expira 30/09/2026)

---

## Out of Scope

- **Troca ou adição de gateway de pagamento** — o foco é a integração correta dos quatro que já existem
- **Refatoração do monólito em serviços/módulos** — dívida real, não bloqueia o trabalho de segurança
- **Migrar `data.json` para Postgres obrigatório** — o modo dual continua, com atomicidade declarada por store
- **Rate limiting por usuário em todas as rotas** — só as rotas de autenticação e cadastro estão limitadas hoje; expandir é otimização, não correção

---

## Traceability

*Roadmapper preencheu em 2026-09-29.*

| Requirement | Phase |
|---|---|
| SEC-01, SEC-02 | Phase 1 — Fechar a superfície exposta |
| SEC-03, SEC-04, SEC-05 | Phase 2 — Webhook à prova de fraude e replay |
| SEC-06, SEC-07, SEC-08 | Phase 3 — Saldo e saque atômicos |
| SEC-09, SEC-10 | Phase 4 — Chave Pix e CPF exclusivos |
| SEC-11, SEC-12, SEC-13, SEC-14 | Phase 5 — Rastreio, fail-closed e alertas |
