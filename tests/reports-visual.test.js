// Renderiza a tab de relatorios num Chromium de verdade, com dado preparado.
// Objetivo: pegar erro de JS no browser que o node --test nao ve.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(process.env.TEMP || '.', 'rep-data.json');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

  // API falsa: devolve o relatorio ja calculado, com os mesmos campos da rota real.
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/api/admin/reports/overview' || u === '/api/admin/reports/holders') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (u.endsWith('overview')) {
        const reports = require('../services/reports');
        const series = reports.buildDailySeries({ transactions: fixture.transactions, users: fixture.users, days: 45, now: Date.now() });
        const liab = reports.buildLiability({ users: fixture.users, pendingWithdrawalsAmount: 900, gatewayBalance: 60000 });
        const conc = reports.buildConcentration({ users: fixture.users });
        const proj = reports.projectCashFlow({ dailySeries: series, currentCash: 60000, days: 30 });
        return res.end(JSON.stringify({
          generatedAt: new Date().toISOString(), windowDays: 45,
          totals: { deposits: 50000, withdrawals: 46000, earnings: 9000, net: 4000 },
          dailySeries: series, liability: liab, concentration: conc,
          projection: { ...proj, sufficiency: proj.sufficiency },
          gateway: { ok: true, gateway: 'asaas', balance: 60000, currency: 'BRL' },
          pendingWithdrawals: { amount: 900, count: 6 },
          closedDays: 44, health: 'warning'
        }));
      }
      return res.end(JSON.stringify({
        rows: fixture.users.map((u, i) => ({
          id: u.id, operatorName: u.operatorName, phone: u.phone, balance: u.balance,
          investBalance: u.investBalance, earnBalance: u.earnBalance,
          totalDeposited: u.totalDeposited, totalWithdrawn: u.totalWithdrawn,
          createdAt: u.createdAt, share: u.balance / 110750
        })).sort((a, b) => b.balance - a.balance),
        concentration: reports_concentration()
      }));
    }
    function reports_concentration() {
      const reports = require('../services/reports');
      const c = reports.buildConcentration({ users: fixture.users });
      return { total: c.total, holders: c.holders, top5Share: c.top5Share, top10Share: c.top10Share, top1Share: c.top1Share, concentrated: c.concentrated };
    }

    // Estaticos: caminhos da raiz (/x.js) vivem em public/, igual no Express real
    // (server.js serve public/). O HTML pede /admin.html e /admin-reports.js.
    let p = u === '/' ? '/admin.html' : u;
    let file = path.join(ROOT, 'public', p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(ROOT, p);
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404); res.end('nope');
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // adminFetch precisa existir; a pagina real define. Injeta antes do load.
  await page.addInitScript(() => {
    window.ADMIN_KEY = 'teste';
    window.adminFetch = async (p) => {
      const r = await fetch('/api/admin' + p, { headers: { 'x-admin-key': 'teste' } });
      return r.ok ? r.json() : null;
    };
    window.loadMetrics = window.loadAnalytics = window.loadWithdrawals = async () => {};
    window.loadUsers = window.loadCareerOverview = window.loadWebhooks = async () => {};
    window.loadProducts = window.loadSettings = window.loadGatewayStatus = async () => {};
    window.loadBonusCodes = window.loadSupportThreads = window.loadLeadsOrigin = async () => {};
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

  // abre a tab
  await page.evaluate(() => { if (window.switchAdminTab) window.switchAdminTab('reports'); });
  await page.waitForSelector('#rep-body .rep-gap', { timeout: 15000 });

  const gap = await page.textContent('#rep-body .rep-gap');
  const svgs = await page.locator('#rep-body svg.rep-chart').count();
  const holders = await page.locator('#rep-holders tbody tr').count();
  const cards = await page.locator('#rep-body .rep-card').count();

  console.log('cards          :', cards);
  console.log('graficos svg   :', svgs);
  console.log('linhas holders :', holders);
  console.log('gap            :', gap.replace(/\s+/g, ' ').trim().slice(0, 90));

  assert.equal(errors.length, 0, 'sem erro de JS: ' + errors.join(' | '));
  assert.ok(svgs >= 3, 'pelo menos 3 graficos');
  assert.ok(cards >= 5, 'pelo menos 5 cards');
  assert.ok(holders >= 5, 'tabela de holders preenchida');
  assert.ok(/NAO cobre/i.test(gap), 'sinal de deficit exibido');
  const badge = await page.textContent('#rep-body .rep-badge');
  assert.ok(/confianca/i.test(badge), 'badge de confianca presente: ' + badge);

  const shot = path.join(process.env.TEMP || '.', 'rep-tab.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log('\nscreenshot:', shot);

  await browser.close();
  server.close();
  console.log('\nOK - tab renderiza sem erro de JS');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });