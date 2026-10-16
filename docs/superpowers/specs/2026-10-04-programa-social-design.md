# Programa Social — R$ 1 por vídeo

**Data:** 2026-10-04
**Status:** aguardando revisão do parceiro
**Decisões já tomadas com ele:** valor R$1/vídeo · aprovação manual no painel · cai no saldo **Investir** · link é o de indicação da própria pessoa

---

## 1. Objetivo

Criar um mecanismo de crescimento orgânico ("bola de neve"): cada operador pode
ganhar **R$ 1 por vídeo** que publicar sobre os drones nas redes sociais,
usando o próprio link de indicação. O objetivo final não é o prêmio em si — é
que cada vídeo traga novos operadores para a plataforma.

## 2. Regras

| Regra | Valor | Origem |
|---|---|---|
| Prêmio por vídeo aprovado | R$ 1,00 | definido com o parceiro |
| Saldo de destino | `investBalance` (comprar cotas) | definido com o parceiro |
| Aprovação | manual, no painel admin | definido com o parceiro |
| Aviso de fila | Telegram | definido com o parceiro |
| Atribuição | link de indicação da pessoa (sem código por vídeo) | definido com o parceiro |
| Mínimo para submeter | conta com ≥ 1 dia **e** ≥ 1 depósito confirmado | proposto na seção 5 |
| Vídeos em análise simultâneos | 1 por pessoa | proposto na seção 5 |
| Saque do prêmio | não sacável direto (só compra cota) | consequência de ir para `investBalance` |

### Por que o saldo Investir

O saque no sistema sai **somente** do `earnBalance` (`routes/wallet.js:762`).
Dinheiro em `investBalance` não volta para o usuário em dinheiro — só compra cota.
Duas consequências boas:

1. **O prêmio é utilizável de imediato** ( abate do valor de uma cota).
2. **Golpeira de conta falsa não lucra.** Quem cria contas descartáveis para
   pedir R$ 1 não consegue sacar nada. O prejuízo fica limitado ao tempo de
   aprovação do admin.

Custo máximo real: cada vídeo aprovado custa R$ 1,00. Como não é sacável, o
investimento é sempre em cotas.

## 3. Fluxo

```
Operador abre "Ganhe R$ 1 postando"
  └─ app mostra o link DELE + roteiro pronto + hashtags
      └─ ele grava, posta, e submete o link do vídeo
          └─ status = pending
              ├─ Telegram avisa o admin
              └─ admin abre o painel, assiste e decide
                   ├─ Aprovar → investBalance += R$1,00 + registro no extrato
                   └─ Recusar → motivo; o operador vê e reenvia
```

## 4. O que o operador publica

Regra acordada: **a pessoa publica o que quiser, desde que anuncie a TruckAuto.**
Não exigimos formato nem que filme o drone real. Barreiras de produção matam o
funil — quem não tem drone não posta nada.

O app oferece dois caminhos, sem hierarquia entre eles:

1. **Vídeo** — 3 roteiros prontos (§9). Caminho que **cresce**: o algoritmo do
   TikTok entrega muito mais vídeo do que imagem estática.
2. **Imagens prontas** — artes fornecidas pelo admin (§8). Caminho mais curto:
   baixar e postar. Para quem não tem tempo de gravar.

### Aviso sobre imagem estática

Post de foto no TikTok tem distribuição baixa por escolha de algoritmo. As
imagens são o atalho para alcançar quem não gravaria, não o motor de viralização.
Por isso os dois caminhos ficam sempre visíveis.

## 5. O que o app oferece ao operador

Na seção **"Ganhe R$ 1 postando"**:

1. **Link de indicação** pronto, um botão pra copiar
2. **3 roteiros de vídeo** (§12) pra copiar e ler
3. **Imagens prontas** — as artes do admin nos 3 formatos (§6), cada uma com
   botão de baixar (no celular, o usuário segura o dedo pra salvar)
4. **Formulário** de envio do vídeo
5. **Histórico** do operador: aprovado (+R$1) / em análise / recusado com motivo
6. **Total ganho** e quantos vídeos foram aprovados

## 6. Geração dos formatos

O admin envia **uma arte completa, com o texto já dentro**. O app deriva os
formatos que as redes exigem:

| Formato | Tamanho | Onde |
|---|---|---|
| Vertical 9:16 | 1080 × 1920 | TikTok, Reels, Stories, Status do WhatsApp |
| Retrato 4:5 | 1080 × 1350 | feed do Instagram (ocupa mais tela) |
| Quadrado 1:1 | 1080 × 1080 | feed, WhatsApp, qualquer lugar |

### Regra: nada é cortado

Cada formato usa **encaixe total** (`contain`): a arte inteira aparece, e o
espaço que sobra nas laterais ou em cima é preenchido com a cor de fundo da
marca. Consequência prática: a arte pode aparecer com barra em alguns formatos.

O admin escolhe a cor de preenchimento na tela de configuração.

### Exigência de conteúdo da arte

Como o texto é do admin, **ele precisa escrever na arte**:

- ✅ **a frase de risco** — "os rendimentos variam, não é retorno garantido"
- ❌ **nunca** promessa de valor fixo ("ganhe R$ 100 por mês")

O material distribuído pelo dono da plataforma é responsabilidade do dono da
plataforma (CVM). Publicidade de investimento com retorno promised é risco
regulatório.

### Link na imagem

Não se queima URL do indicador dentro da arte: link não é clicável em imagem no
TikTok/Instagram e vira lixo ilegível. A arte é isca de atenção; **o link fica na
bio**, que o app já mostra pronto para copiar.

## 7. Dados

### Tabela `social_posts`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | VARCHAR PK | |
| `user_id` | VARCHAR FK → users.id | dono do vídeo |
| `video_url` | TEXT | link enviado |
| `url_hash` | VARCHAR | SHA-256 da URL normalizada; **UNIQUE** (barreira anti-duplicata) |
| `network` | VARCHAR(16) | `tiktok` \| `instagram` \| `reels` |
| `handle` | VARCHAR(64) | @perfil informado |
| `status` | VARCHAR(16) | `pending` \| `approved` \| `rejected` |
| `reject_reason` | TEXT | só no rejected |
| `reward` | NUMERIC(14,2) | 1.00 quando aprovado |
| `created_at` / `reviewed_at` | TIMESTAMPTZ | |

Migration no bloco `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` que já existe em
`database.js` — mesma técnica usada em `ad_reported_at`, idempotente.

### Funções em `database.js`

- `createSocialPost(userId, { videoUrl, network, handle })`
- `getUserSocialPosts(userId)`
- `getPendingSocialPosts()`
- `getSocialPostById(id)`
- `approveSocialPost(id)` — **só** transiciona se `pending`
- `rejectSocialPost(id, reason)`
- `countPendingByUser(userId)`

## 8. Regras de validação

1. **Conta elegível** — criada há ≥ 24h **e** com ≥ 1 depósito confirmado.
   Corta contas descartáveis sem atrapalhar o funil de gente nova (que já fez
   um depósito, por definição).
2. **Um vídeo em análise por pessoa** — bloqueia se já existe `pending` do mesmo
   `user_id`. Anti-encher-a-fila.
3. **URL única** — `url_hash` UNIQUE. O mesmo link não entra duas vezes.
4. **Host permitido** — só `tiktok.com`, `vm.tiktok.com`, `instagram.com`,
   `youtube.com`, `youtu.be`, `fb.watch`, `facebook.com`. O Redirect é
   bloqueado com mensagem clara (sem adivinhar o host final).
5. **Limite de tamanho** — URL até 500 caracteres.
6. **Pelo menos uma arte** — se não houver arte no sistema, a seção avisa que o
   material está sendo preparado e esconde o botão de gerar formatos.

## 9. Endpoints

| Método | Rota | Quem | O quê |
|---|---|---|---|
| `GET` | `/api/social/info` | operador | link, roteiros, imagens, total ganho |
| `POST` | `/api/social/posts` | operador | submeter vídeo |
| `GET` | `/api/social/posts` | operador | histórico do operador |
| `GET` | `/api/admin/social/pending` | admin | fila |
| `GET` | `/api/admin/social/history` | admin | aprovados + recusados |
| `GET` | `/api/admin/social/stats` | admin | pendentes, pagos, **total pago no mês** |
| `POST` | `/api/admin/social/arts` | admin | subir arte do admin |
| `DELETE` | `/api/admin/social/arts/:id` | admin | remover arte |
| `POST` | `/api/admin/social/:id/approve` | admin | aprova e paga |
| `POST` | `/api/admin/social/:id/reject` | admin | recusa com motivo |

### Geração dos formatos no cliente

As artes ficam em `public/social/arts/`. O endpoint devolve a URL da arte
mestra; o **canvas no navegador** gera os 3 formatos sob demanda e oferece o
download. Não há processamento de imagem no servidor — o formato é montado na
hora, no celular de quem está usando.

Isso foi escolha, não limitação: dispensa upload de 3 arquivos, dispensa
ImageMagick no servidor e o download sai na resolução nativa. O custo é que o
primeiro toque leva um instante para desenhar (fonte e imagem carregando).

## 10. Concorrência e dinheiro

**Aprovar não pode pagar duas vezes.** O crédito acontece dentro da transição de
status, no banco:

```sql
UPDATE social_posts SET status='approved', reward=1.00, reviewed_at=NOW()
WHERE id=$1 AND status='pending'
```

Se `rowCount === 0`, alguém já aprovou — o endpoint retorna sem creditar. O
crédito no `investBalance` só roda se essa atualização afetar 1 linha.

Isso não depende de UI: clicar duas vezes, recarregar a página ou abrir em duas
abas não gera pagamento duplicado.

**Rollback:** se o crédito do saldo falhar depois da aprovação, a postagem fica
`approved` sem o R$ 1 e o admin vê o caso. Aceitável — o inverso (pagar sem
marcar) seria pior.

## 11. Telas

### Operador — seção "Ganhe R$ 1 postando"

- Total ganho e quantos vídeos aprovados
- Link de indicação com botão copiar
- Roteiros prontos (3 variações) com hashtags
- Formulário: link do vídeo, rede, @perfil
- Lista dos vídeos: aprovado (+R$1) / em análise / recusado (com motivo)

### Admin — aba "Vídeos"

Fila de pendentes com aprovação rápida — o gargalo é o tempo do admin, não o
custo do prêmio:

- o vídeo abre **na própria tela** (não sai do painel)
- **aprovar/recusar com um clique**, sem confirmação
- **atalhos de teclado**: `A` aprova, `R` recusa, `J`/`K` navegam na fila
- quantos vídeos aquela pessoa **já teve aprovado antes** (ajuda a priorizar e a
  detectar quem está abusando)
- link do vídeo sempre visível, para abrir no TikTok se quiser conferir no
  próprio app

**Total pago no mês**, sempre visível no topo da aba — é o número que decide se
precisa frear. Junto: quantos pendentes, quantos pagos, valor total.

**Sem limite no sistema.** O freio é política do admin ("no máximo 5 por pessoa
por mês"), aplicado olhando a fila. Limite rígido mataria a viralização e
empurraria gente a postar vídeo ruim por causa da pressa.

Histórico de aprovados e recusados.

### Telegram

```
🎥 NOVO VÍDEO PARA APROVAR
👤 Maria (11 98888-7777)
📱 TikTok — @maria.voos
🔗 https://tiktok.com/@maria.voos/video/71...
⏳ 14:32
```

## 12. Roteiros (texto que o operador grava)

Hashtags: **`#truckauto #investimentos #truckautodrones`** (mais as bônus sugeridas
`#entregapor drone #rendadigital #drones`).

> ⚠️ Os textos evitam promessa de retorno. Dizem que o rendimento **varia
> todo dia** e **não é garantido** — marketing com retorno fixo é risco
> regulatório (CVM), e o próprio texto do vídeo fica gravado na prova.

### Roteiro 1 — "Achei um drone" (o que mais engaja)

> "mano, olha só isso aqui [mostra o drone voando]
> eu achei isso voando por cima do bairro
> e o dono me explicou: é uma cota de drone
> ele faz entregas sozinho, 24 horas por dia
> e todo dia rende uma cota
> quem diria…
> você quer entender como funciona? o link tá na bio
> os rendimentos variam todo dia, não é garantido"

### Roteiro 2 — Dia a dia, com prova na tela

> "vim mostrar como funciona um drone de entrega de verdade
> [mostra o drone decolando]
> ele sai sozinho, faz as entregas e volta
> todo dia eu acompanho o rendimento dele no app [mostra a tela]
> um dia você grava um vídeo como esse,
> cola o link lá no app e ganha R$ 1
> o link tá na bio"

### Roteiro 3 — Pergunta direta

> "quanto vale um drone de entrega que trabalha sozinho o dia inteiro?
> …rende uma cota por dia, todo dia
> e o melhor: dá pra assistir ele funcionando
> não é só print, é o drone real voando aqui na sua frente
> quem quiser ver como funciona, link na bio
> os valores variam, não tem retorno garantido"

### Instruções no app

- Grave na **vertical (9:16)** e mostre o drone funcionando de verdade
- Coloque o link de indicação na bio do vídeo
- Cada vídeo aprovado vale R$ 1
- Repita em vídeos diferentes — o app paga R$ 1 em cada um
- Se for recusado, o motivo aparece no app e dá para reenviar

## 13. Fora do escopo (v1)

- Publicar automaticamente nas redes (exigiria.token de cada rede)
--ranking de quem indicou mais
- Pagamento automático (a aprovação é sempre manual)
- Atribuição por vídeo (código `pc` no link) — descartado pelo parceiro

## 14. Como testar

1. **Conta sem depósito**: conta sem depósito é recusada no submit
2. **Duplicata**: mesmo `video_url` duas vezes → segunda bloqueada
3. **Fila**: um `pending` por pessoa
4. **Aprovar 2×**: dois `POST approve` → saldo +1,00 só
5. **Valor**: aprovado soma exatamente 1,00 em `investBalance` e cria
   transação `type='commission'` visível no extrato
6. **Recusar**: motivo gravado e visível ao operador
7. **Host inválido**: `youtube.com.evil.com` é rejeitado
8. **Telegram**: mensagem chega com os campos certos
9. **Imagens**: os 3 formatos (1080×1920, 1080×1350, 1080×1080) são gerados com
   a arte **inteira** visível — sem corte — e o preenchimento usa a cor de fundo
   configurada
10. **Sem artes**: a seção do operador avisa e não quebra
11. **Upload da arte**: só aceita PNG/JPG até 5 MB; aparece na lista do admin
12. **Total do mês**: o valor pago no mês sai de SUM(reward) só dos
    pproved do mês corrente, e não muda com recusa posterior