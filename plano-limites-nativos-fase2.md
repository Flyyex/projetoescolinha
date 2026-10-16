# Plano Fase 2 — Limites Nativos (ProjetoEscola / TRUCKAUTO)

Data: 2026-09-29
Status: APROVADO — em implementação
Origem: separado de `plano-antifraude-bonus-R5.md` (Fase 1 segue guardada, NÃO implementar)

## Objetivo
Limites nativos inspirados em gateways (Pushin Pay), sem serviço externo pago.

## Escopo

### 1. Por conta — depósito
- Mín R$20 (já existe) + **máx R$5.000/tx** e **máx R$10.000/24h rolantes** por conta.
- Janela rolante por `created_at` (`agora - 24h`), não dia corrido.

### 2. Por conta — saque
- Mín R$15 (já existe) + **máx R$2.000/tx** e **máx R$2.000/24h rolantes** por conta.
- **Intervalo mín 24h rolante entre saques** (substitui a regra atual de "1 por dia corrido" em `routes/wallet.js:666-679`, que zera 00:00 e permite saque 23:59 + outro 00:01).
- Retornar `retry_after` (ex: `retryAfterMs`) para o front exibir countdown ("faltam 13h22m").
- Conta nova: **carência 24h para o 1º saque** (desde `created_at`) + **teto R$500 nos 7 primeiros dias**.

### 3. Anti-farm (depende só de IP, sem CPF — CPF é Fase 1)
- **>3 contas/24h rolantes no mesmo IP = `suspeito`**, bônus vai pra revisão (creditado mas flagado p/ admin).
- Requer `register_ip_hash` em `users` (migração nova, sem `UNIQUE` de CPF).
- Bônus R$5 com **expiração 7 dias** (expiry preguiçoso: no saque, se conta sem depósito e bônus com >7d, estorna antes das checagens).
- Comissão **só sobre dinheiro real**: `distributeCareerCommissions` não paga se comprador nunca depositou (`totalDeposited < minDeposit`).

### 4. Global (mata rombo)
- **Teto total de saques R$20k/24h rolantes** — passou disso, `429` + fila pro ciclo seguinte.
- **Chave de emergência no admin**: `payouts_paused` / `deposits_paused` (1 clique pausa saque/depósito).

### 5. Configurável (sem redeploy)
Novas chaves em `system_settings` com defaults:
`max_deposit_tx=5000`, `max_deposit_day=10000`, `max_withdraw_tx=2000`,
`max_withdraw_day=2000`, `new_account_grace_h=24`, `new_account_cap_7d=500`,
`global_daily_withdraw_cap=20000`, `payouts_paused=0`, `deposits_paused=0`.
Editáveis via `PUT /api/admin/settings` (validadas) e expostas em `getMoneyLimits()`.

## Testes de aceite
1. Depósito R$5.001 → `400`. Soma 24h > R$10.000 → `400`.
2. Saque R$2.001 → `400`. Soma 24h > R$2.000 → `400`.
3. Saque 23:59 + outro 00:01 → 2º bloqueado `429` com `retryAfterMs > 23h`.
4. Conta com <24h tenta sacar → `403` carência. Conta com 3 dias saca R$600 → `403` teto 7d.
5. 4ª conta mesmo IP/24h → `suspeito`.
6. Bônus >7d sem depósito → estornado no saque (não conta como saldo).
7. Compra com saldo só-bônus sem depósito → sem comissão ao upline.
8. Soma global 24h > R$20k → `429`. Com `payouts_paused=1` → `403`.
9. Fluxo normal intacto: depósito R$20 → compra → saque após 24h funciona.

## Arquivos
- novo `services/limits.js` (helpers puros + testáveis)
- `routes/wallet.js` (deposit + withdraw)
- `routes/fleet.js` (guarda de comissão)
- `database.js` (`getMoneyLimits`, `getSystemSettings`, migração `register_ip_hash`/`last_withdraw_at`)
- `routes/admin.js` (`PUT /settings`)
- novo `tests/limits.test.js` (`node --test`, sem dependências)
