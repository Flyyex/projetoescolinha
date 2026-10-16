# Plano Anti-Fraude — Bônus R$5 (ProjetoEscola / TRUCKAUTO)

Data: 2026-09-29
Status: PLANEJADO — não implementar ainda (guardar para o futuro)

## Problema
Mesma pessoa criando ~20 contas mudando o final do telefone para farmar o bônus de boas-vindas de R$5 por conta.

Causa raiz hoje:
- `routes/auth.js:40-43` só bloqueia telefone duplicado (com match fraco por sufixo em `database.js:553-562`).
- `routes/auth.js:82-99` credita `signupBonus` (padrão R$5 em `database.js:1758,1838`) sem exigir CPF, depósito ou vínculo de aparelho/IP.
- `database.js` tem coluna `cpf_cnpj` mas sem `UNIQUE` e sem checagem no cadastro — mesmo CPF cria N contas.
- `routes/wallet.js:108-110` sobrescreve o CPF do usuário no depósito sem travar (permite trocar de CPF).
- `routes/wallet.js:635-726` valida formato da chave Pix no saque mas não checa reuso da mesma chave em várias contas.
- `server.js:61-68` permite 60 cadastros/h por IP — 20 contas passam em minutos e IP não é gravado no usuário.

## Decisões já tomadas
- Sem SMS pago e sem API externa paga.
- Sem OTP por enquanto (Evolution/Telegram ficam como opção futura).
- Regra incluída a pedido: **CPF do depósito = CPF do cadastro**.
- Bônus continua caindo na hora (para não matar conversão). Trava é por unicidade + vínculo, não por adiar bônus.

## Plano (6 itens, zero custo externo)

### 1. Cadastro — CPF/CNPJ obrigatório e único
Arquivo: `routes/auth.js`
- Exigir `cpfCnpj` no `POST /api/auth/register`.
- Normalizar (só dígitos) e validar dígito verificador local (módulo 11) para CPF 11 dígitos e CNPJ 14 dígitos.
- Novo `findUserByCpf(doc)` em `database.js`; se já existir, retornar `400 - Este CPF já possui conta`.
- Não permitir auto-indicação em cadeia óbvia (opcional v1: logar `referredBy` para auditoria).

### 2. Trava de documento + IP no banco
Arquivo: `database.js`
- Migração Postgres: `UNIQUE (cpf_cnpj)` onde não-nulo + `ADD COLUMN register_ip_hash VARCHAR(64)` + `ADD COLUMN device_hash VARCHAR(64)` se não existirem.
- Mesmo espelho no modo `data.json` (checagem em `createUser`).
- Depois de salvo, usuário comum não altera CPF sozinho — só admin (`routes/admin.js`).

### 3. Depósito — CPF do depósito = CPF do cadastro
Arquivos: `routes/wallet.js:deposit/pix` (~linhas 93-110) e webhooks `mistic`/`syncpay`
- Se `user.cpfCnpj` já existe e `req.body.cpfCnpj` vier diferente → `403 - CPF do depósito diverge do cadastro`.
- Se `user.cpfCnpj` vazio (base antiga): salva UMA vez e trava.
- Remover sobrescrita silenciosa atual.
- Webhooks: quando o gateway informar CPF do pagador divergente do dono da conta, não creditar automático — registrar em `webhook_logs` como `revisão` para o admin decidir.

### 4. Saque — amarrar chave Pix à conta
Arquivo: `routes/wallet.js:withdraw` (~linhas 635-726)
- Se `pixKeyType === 'CPF'`, exigir `normalizado(pixKey) === user.cpfCnpj`, senão `403`.
- 1 chave Pix normalizada = 1 conta: checar `transactions` com saque `approved/pending/processing` usando mesma `pix_key` em `user_id` diferente → bloquear com `403 - Chave Pix já vinculada a outra conta`.
- Manter regras atuais: mínimo `minWithdraw` (R$15), exige `totalDeposited >= minDeposit` (R$20).
- **Trocar trava atual de "1 saque por dia corrido" (`routes/wallet.js:666-679`, compara `toLocaleDateString` SP — zera 00:00 e libera saque das 23:59 + outro 00:01) por contador rolante de 24h: gravar `last_withdraw_at`, bloquear se `NOW - last_withdraw_at < 24h` e retornar `retry_after` com countdown (ex: "faltam 13h22m"). Front exibe o contador.

### 5. Anti-farm por IP/aparelho (sem bloquear Wi-Fi legítimo)
Arquivos: `server.js`, `routes/auth.js`, `routes/admin.js`
- `registerLimiter`: `60/h` → `10/h` por IP.
- Gravar `register_ip_hash` (sha256 IP + salt, mesmo padrão do analytics em `server.js:83`) + `device_hash` (user-agent normalizado) no `createUser`.
- Se >3 contas/24h no mesmo `register_ip_hash`, novas entram com `crmStatus = 'suspeito'` (não bloqueia na hora, só flagua).
- Admin lista suspeitos por IP/Pix repetido com botão banir + estornar bônus `BNS-SIGNUP-*`.

### 6. Limpeza da base atual (antes de ligar o UNIQUE)
- Rodar relatório: agrupar `users` por `cpf_cnpj` e por `pix_key` em saques aprovados.
- Definir regra: mantém a conta mais antiga com depósito, demais vão para `suspeito`/ban + estorno do bônus.
- Só depois ativar constraint `UNIQUE`.

## Testes de aceite (quando for implementar)
1. 2º cadastro com mesmo CPF → `400`.
2. CPF com DV inválido (`111.111.111-11`, sequencial) → `400`.
3. Depósito com CPF divergente do cadastro → `403`.
4. Saque com chave CPF diferente do cadastro → `403`.
5. Mesma chave Pix em 2 contas → 2º saque `403`.
6. 4º cadastro em 24h no mesmo IP → conta criada como `suspeito`, visível no admin.
7. Fluxo normal intacto: cadastro CPF novo → bônus R$5 → depósito R$20 com mesmo CPF → saque R$15+ funciona.

## Fase 2 — Limites nativos → MOVIDA para `plano-limites-nativos-fase2.md` (aprovada, em implementação)

## O que ficou de fora (futuro, se o farm evoluir)
- OTP WhatsApp via Evolution (`EVOLUTION_API_URL` + `services/whatsappQueue.js`) ou Telegram (`TELEGRAM_BOT_TOKEN`) — grátis, mas não impede dono de 20 chips.
- Validação Receita/BrasilAPI ou KYC pago — único jeito de provar que CPF é da pessoa (gerador quebra DV local).
- Bônus só após 1º depósito (mata farm na raiz, mas derruba conversão — decisão atual: não fazer).
- Fingerprint forte de aparelho (canvas/fingerprintjs) no `public/login.html`.

## Arquivos tocados (quando implementar)
- `routes/auth.js`
- `routes/wallet.js`
- `database.js`
- `server.js`
- `routes/admin.js`
- `public/login.html` (campo CPF + mensagem de erro) — se quiser
