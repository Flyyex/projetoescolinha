# i18n global v1 (app do operador) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PT/ES/EN/ZH switchable via global modal on login + operator app, with PT fallback.

**Architecture:** UMD `public/i18n.js` (pure core unit-tested + thin DOM layer e2e-tested), JSON dicts in `public/i18n/`, static HTML via `data-i18n*`, dynamic `app.js` strings via `t()`, Playwright e2e after implementation before push.

**Tech Stack:** Vanilla JS (UMD, no deps), `node --test`, `@playwright/test` (chromium only).

**Spec:** `docs/superpowers/specs/2026-09-29-i18n-app-operador-design.md`

## Global Constraints

- v1 touches ONLY `public/index.html`, `public/login.html`, `public/app.js` (+ new files). No backend, no admin.html, no presell, no legal, no CRM.
- PT is source of truth; missing key renders PT, never empty.
- Money stays BRL/R$; only labels translate.
- PowerShell: chain with `; if ($?) { ... }`, never `&&`; workdir `ProjetoEscola`.
- Every commit: tests green first.

---

## File Structure

- Create: `public/i18n.js` — UMD `TruckAutoI18n`: pure core (`resolveLang`, `lookup`, `interpolate`, `LOCALES`) + DOM layer (`loadLang`, `setLang`, `t`, `applyStatic`, `onLangChange`). One responsibility: language state + string resolution.
- Create: `public/i18n/pt.json`, `es.json`, `en.json`, `zh.json` — key tree `login.* nav.* home.* fleet.* wallet.* team.* profile.* support.* common.*`.
- Create: `tests/i18n.test.js` — pure-core unit tests only (no DOM).
- Modify: `public/index.html` — script tags, `data-i18n*`, 🌐 button in header actions (next to `#btn-theme-toggle`, `index.html:54-56`), `#modal-lang` modal, `<html lang>`.
- Modify: `public/login.html` — script tags, `data-i18n*`, 🌐 button above `.auth-card`, own `#modal-lang` overlay (login.html has NO modal system — build minimal overlay div + show/hide functions, do not import app.js).
- Modify: `public/app.js` — `t()` in renders/alerts, locale-aware `formatCurrency`/`formatDate`, `truckauto:lang` re-render listener.
- Create (Task 8): `playwright.config.js`, `e2e/lang.spec.js`.

---

### Task 1: i18n.js pure core + unit tests

**Files:**
- Create: `public/i18n.js` (pure core section only: `LOCALES`, `SUPPORTED`, `resolveLang`, `lookup`, `interpolate`)
- Create: `tests/i18n.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `TruckAutoI18n.resolveLang(saved, navLang) -> 'pt'|'es'|'en'|'zh'`; `TruckAutoI18n.lookup(dict, fallbackDict, key) -> string`; `TruckAutoI18n.interpolate(str, vars) -> string`; `TruckAutoI18n.LOCALES` map to `pt-BR/es-ES/en-US/zh-CN`. Tasks 2+ rely on these exact names.

- [ ] **Step 1: Write the failing test** (`tests/i18n.test.js`):

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../public/i18n.js');

describe('resolveLang', () => {
  it('prefere salvo válido', () => {
    assert.equal(I.resolveLang('es', 'en-US'), 'es');
  });
  it('mapeia navigator para suportados', () => {
    assert.equal(I.resolveLang('', 'en-US'), 'en');
    assert.equal(I.resolveLang('', 'zh-CN'), 'zh');
    assert.equal(I.resolveLang('', 'es-MX'), 'es');
  });
  it('cai em pt para resto/lixo', () => {
    assert.equal(I.resolveLang('', 'fr-FR'), 'pt');
    assert.equal(I.resolveLang('xx', 'xx'), 'pt');
  });
});

describe('lookup', () => {
  const pt = { nav: { home: 'Início' } };
  it('acha chave aninhada', () => {
    assert.equal(I.lookup({ nav: { home: 'Inicio' } }, pt, 'nav.home'), 'Inicio');
  });
  it('fallback pt quando falta', () => {
    assert.equal(I.lookup({}, pt, 'nav.home'), 'Início');
  });
  it('devolve a chave quando nem pt tem', () => {
    assert.equal(I.lookup({}, {}, 'x.y'), 'x.y');
  });
});

describe('interpolate', () => {
  it('troca {var}', () => {
    assert.equal(I.interpolate('Mín R$ {min}', { min: '15,00' }), 'Mín R$ 15,00');
  });
  it('mantém placeholder sem valor', () => {
    assert.equal(I.interpolate('Olá {nome}', {}), 'Olá {nome}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/i18n.test.js`
Expected: FAIL with `Cannot find module '../public/i18n.js'`

- [ ] **Step 3: Write minimal implementation** (`public/i18n.js`, UMD shell identical to `public/admin-filters.js`):

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TruckAutoI18n = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SUPPORTED = ['pt', 'es', 'en', 'zh'];
  const LOCALES = { pt: 'pt-BR', es: 'es-ES', en: 'en-US', zh: 'zh-CN' };

  function resolveLang(saved, navLang) {
    const s = String(saved || '').toLowerCase().trim();
    if (SUPPORTED.indexOf(s) !== -1) return s;
    const n = String(navLang || '').toLowerCase().trim();
    for (const l of SUPPORTED) { if (l !== 'pt' && n.indexOf(l) === 0) return l; }
    return 'pt';
  }

  function lookup(dict, fallbackDict, key) {
    const get = (o) => String(key).split('.').reduce(
      (a, p) => (a && Object.prototype.hasOwnProperty.call(a, p) ? a[p] : undefined), o);
    const v = get(dict);
    if (typeof v === 'string') return v;
    const fb = get(fallbackDict);
    if (typeof fb === 'string') {
      if (typeof console !== 'undefined') console.warn('[i18n] missing: ' + key);
      return fb;
    }
    return key;
  }

  function interpolate(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) =>
      (vars && vars[k] !== undefined ? vars[k] : m));
  }

  return { SUPPORTED, LOCALES, resolveLang, lookup, interpolate };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/i18n.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add public/i18n.js tests/i18n.test.js
git commit -m "i18n: núcleo puro (resolveLang, lookup, interpolate) + testes"
```

### Task 2: DOM layer (loadLang, setLang, t, applyStatic)

**Files:**
- Modify: `public/i18n.js` (append DOM layer inside same UMD factory)
- Modify: `tests/i18n.test.js` (no new unit tests — DOM layer is covered by Task 8 e2e; pure core tests must stay green)

**Interfaces:**
- Consumes: Task 1 pure core.
- Produces: `TruckAutoI18n.getLang()`, `TruckAutoI18n.setLang(lang) -> Promise`, `TruckAutoI18n.t(key, vars)`, `TruckAutoI18n.applyStatic(root)`. Tasks 4–6 call exactly these.

- [ ] **Step 1: Append DOM layer** to `public/i18n.js` before the `return` (extend returned object with `getLang, setLang, t, applyStatic`):

```js
  const STORE_KEY = 'truckauto_lang';
  let current = 'pt';
  let cache = {}; // lang -> dict
  let ptDict = null;

  function lsGet() { try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function lsSet(v) { try { window.localStorage.setItem(STORE_KEY, v); } catch (e) {} }
  function navLang() { return (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || ''; }

  function getLang() { return current; }

  async function loadLang(lang) {
    if (cache[lang]) return cache[lang];
    const res = await fetch('/i18n/' + lang + '.json');
    if (!res.ok) throw new Error('i18n 404 ' + lang);
    const dict = await res.json();
    cache[lang] = dict;
    return dict;
  }

  async function setLang(lang) {
    const target = SUPPORTED.indexOf(lang) !== -1 ? lang : 'pt';
    try { await loadLang('pt').then((d) => { ptDict = d; }); } catch (e) {}
    try { await loadLang(target); } catch (e) {}
    if (!cache[target] && !cache.pt && !ptDict) return current;
    current = cache[target] ? target : 'pt';
    lsSet(current);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = LOCALES[current];
      applyStatic(document);
      window.dispatchEvent(new Event('truckauto:lang'));
    }
    return current;
  }

  function t(key, vars) {
    return interpolate(lookup(cache[current] || {}, ptDict || cache.pt || {}, key), vars);
  }

  function applyStatic(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    r.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  }

  function init() {
    current = resolveLang(lsGet(), navLang());
    return setLang(current).catch(() => current);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
```

Return object becomes: `{ SUPPORTED, LOCALES, resolveLang, lookup, interpolate, getLang, setLang, t, applyStatic }`.

- [ ] **Step 2: Run unit tests (must stay green)**

Run: `node --test tests/i18n.test.js`
Expected: PASS (DOM layer references `window`/`document` only inside functions never called in node)

- [ ] **Step 3: Commit**

```bash
git add public/i18n.js
git commit -m "i18n: camada DOM (setLang, t, applyStatic, truckauto:lang)"
```

### Task 3: pt.json dictionary v1

**Files:**
- Create: `public/i18n/pt.json`

**Interfaces:**
- Consumes: key tree from spec §3.1.
- Produces: full PT dict. Tasks 4–6 add `data-i18n`/t() referencing exactly these keys; Task 7 translates them 1:1.

Content (complete — every key Tasks 4–6 will reference):

```json
{
  "common": { "close": "Fechar", "cancel": "Cancelar", "save": "Salvar", "copy": "Copiar", "copied": "Copiado!", "confirm": "Confirmar", "back": "Voltar", "loading": "Carregando...", "language": "Idioma" },
  "login": {
    "subtitle": "Terminal de Gestão de Frotas Autônomas",
    "tabLogin": "Entrar", "tabRegister": "Criar Conta",
    "phoneLabel": "Telefone do Operador (WhatsApp):", "phonePh": "(11) 98765-4321",
    "passLabel": "Senha de Segurança:", "passPh": "Digite sua senha",
    "loginBtn": "Acessar Painel",
    "nameLabel": "Seu Nome:", "namePh": "Como podemos te chamar?",
    "waLabel": "Seu WhatsApp de Acesso:",
    "passCreateLabel": "Crie uma Senha:", "passCreatePh": "Mínimo 6 caracteres",
    "registerBtn": "Criar Minha Conta"
  },
  "nav": { "home": "Início", "fleet": "Frotas", "products": "Catálogo", "team": "Equipe", "profile": "Perfil" },
  "home": {
    "balances": "Saldos", "toInvest": "💰 PARA INVESTIR", "toWithdraw": "💸 PARA SACAR",
    "total": "Total R$", "todayYield": "Rendimento Previsto Hoje", "totalAccum": "Total Acumulado",
    "drippedToday": "Caído hoje:", "ofDay": "{pct}% do dia",
    "depositBtn": "Recarga Pix", "withdrawBtn": "Saque",
    "hideBalance": "Ocultar saldo", "showBalance": "Mostrar saldo"
  },
  "wallet": {
    "depositTitle": "Recarga Pix", "withdrawTitle": "Saque Pix",
    "amount": "Valor (R$)", "pixKey": "Chave Pix",
    "minDeposit": "O valor mínimo de recarga é R$ {min}.",
    "minWithdraw": "O valor mínimo de saque é R$ {min}.",
    "invalidPix": "Chave Pix inválida: {msg}",
    "fillPix": "Preencha a Chave Pix.",
    "bonusTitle": "Resgatar Cupom", "checkinTitle": "Check-in Diário"
  },
  "support": { "title": "Suporte", "replyPh": "Responder...", "send": "Enviar", "openChat": "Falar com suporte" },
  "team": { "title": "Minha Equipe", "copyInvite": "Copiar link de convite", "copiedInvite": "Link copiado!" }
}
```

- [ ] **Step 1: Create file** with the JSON above; validate: `node -e "JSON.parse(require('fs').readFileSync('public/i18n/pt.json','utf8')); console.log('pt.json OK')"`
- [ ] **Step 2: Commit**

```bash
git add public/i18n/pt.json
git commit -m "i18n: dicionário PT v1 (login + app)"
```

### Task 4: index.html static wiring

**Files:**
- Modify: `public/index.html` (only static markup + script tags; no logic changes)

**Interfaces:**
- Consumes: Task 2 `applyStatic`/`setLang`, Task 3 keys.
- Produces: 🌐 button `#btn-lang` in header actions; `#modal-lang` modal following existing `.modal` pattern (`index.html:804` modal-welcome style); `data-i18n*` on header/nav/balance/buttons/static modal titles.

Steps (each verifiable by grep, no backend):
- [ ] **Step 1:** Add before `</body>` (next to existing scripts): `<script src="/i18n.js"></script>`. Add `<html lang="pt-BR">` stays (JS updates at runtime).
- [ ] **Step 2:** Header actions (`index.html:50-57`): insert after `#btn-theme-toggle`:
```html
<button class="icon-btn" id="btn-lang" onclick="openLangModal()" data-i18n-aria="common.language" aria-label="Idioma">🌐</button>
```
- [ ] **Step 3:** `#modal-lang` modal after `#modal-welcome` block, same `.modal` structure with 4 buttons `onclick="chooseLang('pt'|'es'|'en'|'zh')"` each with `data-lang="pt|es|en|zh"`, labels in native names, `data-i18n` on its title (`common.language`). App-level inline helpers (in `app.js` or small script block): `openLangModal()` → `openModal('modal-lang')`; `chooseLang(l)` → `closeModal('modal-lang')` + `TruckAutoI18n.setLang(l)`.
- [ ] **Step 4:** `data-i18n` attributes: nav tab labels (`nav.*`), balance card (`home.*`: `home.balances`, `home.toInvest`, `home.toWithdraw`, `home.total`, `home.todayYield`, `home.totalAccum`, `home.depositBtn`, `home.withdrawBtn`), `aria-label`s via `data-i18n-aria`. Placeholders in deposit/withdraw modals via `data-i18n-ph` (`wallet.amount`, `wallet.pixKey`).
- [ ] **Step 5:** Verify: `node -e` script asserting every `data-i18n="X"` value exists in pt.json keys (flatten). Must print OK with 0 missing.
- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "i18n: index.html estático (data-i18n, botão e modal de idioma)"
```

### Task 5: login.html wiring (own modal system)

**Files:**
- Modify: `public/login.html`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: translated login/register; `openLangModalLogin()`/`chooseLangLogin(l)` + `#modal-lang-login` overlay (plain div, `display:flex/none`, NOT app.js functions).

Steps:
- [ ] **Step 1:** Add `<script src="/i18n.js"></script>` + 🌐 button `#btn-lang-login` above `.auth-card` + `#modal-lang-login` overlay with 4 native-name buttons, each with `data-lang="pt|es|en|zh"` (required by Task 8 e2e selectors).
- [ ] **Step 2:** Inline functions (bottom script of login.html):
```js
function openLangModalLogin() { document.getElementById('modal-lang-login').style.display = 'flex'; }
function chooseLangLogin(l) {
  document.getElementById('modal-lang-login').style.display = 'none';
  if (window.TruckAutoI18n) window.TruckAutoI18n.setLang(l);
}
```
- [ ] **Step 3:** `data-i18n`/`data-i18n-ph` on: subtitle (`login.subtitle`), tabs (`login.tabLogin/tabRegister`), all labels/placeholders/buttons listed in Task 3 `login.*`.
- [ ] **Step 4:** Verify: same key-coverage node check as Task 4 Step 5 against `login.*` + `common.*`.
- [ ] **Step 5: Commit**

```bash
git add public/login.html
git commit -m "i18n: login.html traduzível + modal de idioma próprio"
```

### Task 6: app.js dynamic extraction

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: zero hardcoded PT in touched render/alert paths; `truckauto:lang` listener re-rendering visible tab.

Batch 1 — chrome + balances + locale (do first, verify, commit):
- [ ] Replace `formatCurrency` (`app.js:6-11`) locale `'pt-BR'` with `(window.TruckAutoI18n ? TruckAutoI18n.LOCALES[TruckAutoI18n.getLang()] : 'pt-BR')`, guarded in try/catch falling back to `pt-BR`.
- [ ] Add near init:
```js
if (typeof window !== 'undefined') window.addEventListener('truckauto:lang', () => { renderVisibleTab(); });
function renderVisibleTab() {
  const active = document.querySelector('.tab-pane.active');
  const id = active ? active.id : 'tab-home';
  if (id === 'tab-home') { renderHome(); }
  else if (id === 'tab-myfleet') { renderMyFleet(); }
  else if (id === 'tab-team') { renderTeam(); }
  else if (id === 'tab-profile') { renderProfile(); }
}
```
(Use the REAL render function names in app.js — grep `^function render|^async function render` first; if names differ, use them. The plan's names are placeholders only if verification shows otherwise — verify before editing.)
- [ ] Replace nav/balance/home literals with `t('nav.*')`/`t('home.*')` incl. `alert()` minimums → `t('wallet.minDeposit', {min})`.
- [ ] Verify: `node --check` equivalent for browser file — extract app.js via `node --check public/app.js` (parses; DOM refs only run in browser). Plus grep: touched functions contain no raw `alert('O valor mínimo`.
- [ ] Commit: `git add public/app.js && git commit -m "i18n: app.js lote 1 (chrome, saldos, locale)"`

Batch 2 — modals + alerts + team/support (then commit `i18n: app.js lote 2 (modais, alerts, equipe)`):
- [ ] Modal titles/buttons (`wallet.*`, `support.*`), check-in/bonus flows, `confirm()` strings → `t()`.
- [ ] Team/invite strings (`team.*`: copy link, copied feedback).
- [ ] Same verify + commit.

### Task 7: es/en/zh dictionaries

**Files:**
- Create: `public/i18n/es.json`, `en.json`, `zh.json`

**Interfaces:**
- Consumes: Task 3 key list (translate 1:1, same tree, `zh` simplified).
- Produces: 3 files; key-coverage check must show 0 missing vs pt.json for each.

- [ ] **Step 1:** Generate translations for every Task 3 key (AI draft; mark nothing — review happens live per spec).
- [ ] **Step 2:** Verify: node script comparing flattened keys of each vs pt.json; 0 missing, 0 extra.
- [ ] **Step 3: Commit**

```bash
git add public/i18n/es.json public/i18n/en.json public/i18n/zh.json
git commit -m "i18n: dicionários ES/EN/ZH v1 (rascunho IA, revisar no ar)"
```

### Task 8: Playwright e2e (after implementation, before push)

**Files:**
- Create: `playwright.config.js`, `e2e/lang.spec.js`
- Modify: `package.json` (add `@playwright/test` devDep via `npm i -D @playwright/test`; then `npx playwright install chromium` — one-time, ~170MB)

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces: green e2e proving modal, switch, persistence, no raw keys.

`playwright.config.js`:
```js
module.exports = {
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3100', locale: 'pt-BR' },
  webServer: { command: 'node server.js', port: 3100, env: { PORT: '3100' }, reuseExistingServer: true },
};
```

`e2e/lang.spec.js` (fails before Tasks 4–5, passes after — write it FIRST):
```js
const { test, expect } = require('@playwright/test');

test('modal abre e troca para inglês no login', async ({ page }) => {
  await page.goto('/login');
  await page.click('#btn-lang-login');
  await page.click('#modal-lang-login button[data-lang="en"]');
  await expect(page.locator('#btn-tab-login')).toContainText('Log in');
});

test('idioma persiste após reload', async ({ page }) => {
  await page.goto('/login');
  await page.click('#btn-lang-login');
  await page.click('#modal-lang-login button[data-lang="es"]');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('truckauto_lang'))).toBe('es');
  await page.reload();
  const tabText = await page.locator('#btn-tab-login').textContent();
  expect(tabText.trim() === 'Entrar').toBe(false); // trocou de idioma (texto exato vive nos dicionários)
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES');
});
```

Constraint (do NOT violate): specs touch ONLY static pages + localStorage; never submit forms, never create accounts (would pollute `data.json` / production-like DB).

- [ ] Steps: write spec (RED vs current code) → setup → implement Tasks 4–7 → `npx playwright test` GREEN → commit (`test: e2e idioma (playwright)`).

### Task 9: Full verification + push

- [ ] **Step 1:** `node --test tests/` — all suites green (i18n, limits, admin-filters).
- [ ] **Step 2:** `npx playwright test` — green.
- [ ] **Step 3:** Manual sweep: login + 5 app tabs in PT/ES/EN/ZH, no raw `a.b` keys visible, `document.lang` correct, reload persistence.
- [ ] **Step 4:** Sync + push: `git fetch origin`; `git pull --rebase origin main`; `git push origin main`.

## Self-Review

**Spec coverage:** §3.1 dicts→T3+T7; §3.2 API→T1+T2; §3.3 modal→T4+T5; §3.4 extraction order→T6 batches; §3.5 locale→T6 batch 1; §5 unit→T1, e2e→T8; §7 aceite 1–2→T8, 3→T9 step 3, 4→T1 lookup test, 5→T9. Backend/admin/presell untouched per §2. No gaps.

**Placeholder scan:** all steps carry exact code/commands; `renderVisibleTab` names flagged for pre-edit grep verification (not a placeholder — named verification step). No TBD/TODO.

**Type consistency:** `setLang -> Promise<string>`, `t(key, vars) -> string`, `lookup(dict, fb, key)`, filter `match*(item, {q,status,...})` untouched. `data-lang` attributes on modal buttons match e2e selectors (`#modal-lang-login button[data-lang="en"]`) — Task 5 MUST include `data-lang` attributes (stated in e2e; enforced by Task 8 RED run).
