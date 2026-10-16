# Design: i18n global PT/ES/EN/ZH — v1 app do operador

Data: 2026-09-29 | Status: SPEC APROVADA (aguardando revisão do usuário antes do plano)
Decisões: escopo v1 = login + app do operador | abordagem A (dicionários próprios) | traduções ES/EN/ZH geradas por IA na implementação, revisão humana depois no ar

## 1. Problema
Plataforma 100% em PT hardcoded, sem nenhuma infra de i18n. Textos espalhados em HTML estático (`login.html` 26KB, `index.html` 64KB) e JS dinâmico (`app.js` ~114KB: renders, `alert()`/`confirm()`, validações). Expandir para ES/EN/ZH exige camada de tradução antes de qualquer tela nova.

## 2. Fora do escopo do v1 (fases futuras, cada uma com spec própria)
- `presell.html`, `termos.html`, `privacidade.html`, `admin.html`, CRM em `/crm`
- Mensagens de erro vindas do backend (exibidas em PT no v1)
- Conversão de moeda (valores seguem em R$/BRL; só rótulos traduzem)
- Pluralização avançada, RTL, fontes CJK embutidas (usa fonte do sistema)

## 3. Arquitetura
```
public/i18n/{pt,es,en,zh}.json   dicionários (pt = fonte da verdade)
public/i18n.js                   UMD: t(key,vars), setLang(), getLang(), applyStatic(), onLangChange()
public/index.html, login.html    data-i18n / data-i18n-ph / data-i18n-aria + botão 🌐 + modal #modal-lang
public/app.js                    literais → t(); re-render no evento truckauto:lang
```

### 3.1 Dicionários
- Chaves hierárquicas por área: `login.*`, `nav.*`, `home.*`, `fleet.*`, `wallet.*`, `team.*`, `profile.*`, `support.*`, `common.*` (botões genéricos: salvar, cancelar, fechar, copiar, confirmar).
- Interpolação mínima `{var}` (ex: `wallet.minWithdraw: "Saque mínimo R$ {min}"`).
- `zh` = chinês simplificado (zh-CN).
- Chave ausente no idioma ativo → fallback PT + `console.warn('[i18n] missing: <lang>:<key>')`. Nunca render vazio.

### 3.2 i18n.js (API)
- `getLang()` — ordem: `localStorage truckauto_lang` → `navigator.language` (prefixos `es`/`en`/`zh` mapeiam; resto `pt`) → `pt`.
- `setLang(lang)` — valida contra `['pt','es','en','zh']`, persiste, carrega JSON (cache em memória), seta `document.documentElement.lang` (`pt-BR/es-ES/en-US/zh-CN`), aplica estático, dispara `window.dispatchEvent(new Event('truckauto:lang'))`.
- `t(key, vars)` — lookup + interpolação + fallback PT.
- `applyStatic(root=document)` — percorre `[data-i18n]` (textContent), `[data-i18n-ph]` (placeholder), `[data-i18n-aria]` (aria-label).
- Carregamento: `fetch` com fallback embutido? Não — se o JSON falhar, trava em PT e loga (sem dependência externa, offline-first como o resto do PWA).

### 3.3 Modal global de idioma
- Botão 🌐 fixo: header do app (`index.html`) e tela de login (`login.html`).
- Modal `#modal-lang` (segue o padrão de modal de cada página — verificar o sistema de modais de `login.html` na fase de plano; no app reusa `openModal/closeModal`): 4 opções em nome nativo — Português, Español, English, 中文 — com check na ativa.
- Troca aplica sem reload; partes dinâmicas do app re-renderizam via listener `truckauto:lang` (chama os renders da tela visível).

### 3.4 Extração no app.js (ordem)
1. Nav/tabs/cabeçalhos, saldos e rótulos de carteira.
2. Modais (saque, depósito, bônus, check-in, suporte) e botões.
3. `alert()`/`confirm()` e mensagens de validação client-side.
4. Extrato/histórico e textos de rede/equipe.
- Regra: nenhuma string PT visível nova após o v1 — tudo via `t()` ou `data-i18n`.

### 3.5 Formatação por locale
- `formatCurrency`/`formatDate` passam a usar locale do idioma ativo (`pt-BR`, `es-ES`, `en-US`, `zh-CN`). Moeda continua BRL/R$.

## 4. Erros e edge cases
- JSON de idioma corrompido/404 → PT + warn, app nunca quebra.
- `localStorage` indisponível → idioma só em memória na sessão.
- Chinês sem fonte CJK instalada → fallback do sistema (aceito no v1).

## 5. Testes
- Unit `node --test tests/i18n.test.js`: fallback PT, interpolação, mapeamento `navigator.language`, `applyStatic` (via stub mínimo de DOM ou extração das funções puras).
- **e2e Playwright (pós-implementação, antes do push)**: instalar `@playwright/test`; specs — modal abre e lista 4 idiomas; troca ES/EN/ZH persiste após reload; nenhuma chave crua `xxx.yyy` visível nas telas v1; `document.lang` correto.

## 6. Arquivos (implementação)
- novos: `public/i18n.js`, `public/i18n/{pt,es,en,zh}.json`, `tests/i18n.test.js`, (pós: `playwright.config.*`, `e2e/lang.spec.*`)
- editar: `public/index.html`, `public/login.html`, `public/app.js`
- Não toca: backend, `admin.html`, presell, legal, CRM.

## 7. Critérios de aceite do v1
1. Modal 🌐 abre em login e app, troca entre os 4 idiomas sem reload.
2. Idioma persiste após fechar/reabrir (localStorage) e default respeita o navegador.
3. Login + telas do app sem texto PT vazado nos 4 idiomas (varredura manual + e2e).
4. Chave faltante nunca quebra tela (cai pra PT).
5. Unit + e2e verdes antes do push.
