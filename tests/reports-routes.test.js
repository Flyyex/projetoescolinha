// Teste de integracao leve: sobe o express com os routers reais e bate nas
// rotas de relatorio. Usa o data.json local (vazio), entao valida sobretudo
// a forma da resposta e a degradacao quando nao ha dado nenhum.
// AS env vars precisam existir ANTES do require: routes/admin.js le ADMIN_KEY
// no topo do modulo (admin.js:62), entao setar depois nao teria efeito e o
// middleware rejeitaria tudo com 401.
process.env.ADMIN_KEY = 'chave-de-teste-local';
process.env.DATABASE_URL = '';

const http = require('node:http');
const express = require('express');
const assert = require('node:assert/strict');
const test = require('node:test');

const adminRoutes = require('../routes/admin');

function listen(app) {
  return new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

function get(server, path, key) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { 'x-admin-key': key } },
      res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch {}
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('rotas de relatorio', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  const server = await listen(app);
  const key = process.env.ADMIN_KEY;

  t.after(() => new Promise(r => server.close(r)));

  await t.test('exige chave de admin', async () => {
    const r = await get(server, '/api/admin/reports/overview', 'chave-errada');
    assert.equal(r.status, 401);
  });

  await t.test('overview responde com a forma completa mesmo sem dado', async () => {
    const r = await get(server, '/api/admin/reports/overview?days=30', key);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.dailySeries), 'serie diaria presente');
    assert.equal(r.body.dailySeries.length, 30, '30 dias mesmo sem movimento');
    assert.ok(r.body.liability, 'bloco de obrigacao');
    assert.ok(r.body.concentration, 'bloco de concentracao');
    assert.ok(r.body.projection, 'bloco de projecao');
    assert.ok(['ok', 'warning', 'critical'].includes(r.body.health), 'sinal de saude');
  });

  await t.test('sem historico suficiente a projecao avisa e nao projeta', async () => {
    const r = await get(server, '/api/admin/reports/overview?days=30', key);
    assert.equal(r.body.projection.reliable, false);
    assert.equal(r.body.projection.breakevenDate, null, 'nao inventa data');
    assert.ok(r.body.projection.warning, 'diz o motivo');
  });

  await t.test('gap e null quando nao ha chave de gateway', async () => {
    const r = await get(server, '/api/admin/reports/overview?days=30', key);
    assert.equal(r.body.gateway.ok, false, 'avisa que nao leu o saldo');
    assert.ok(r.body.gateway.error, 'com motivo');
    assert.equal(r.body.liability.gap, null, 'null, nunca 0 inventado');
  });

  await t.test('janela de 7 dias funciona', async () => {
    const r = await get(server, '/api/admin/reports/overview?days=7', key);
    assert.equal(r.status, 200);
    assert.equal(r.body.dailySeries.length, 7);
  });

  await t.test('holders responde', async () => {
    const r = await get(server, '/api/admin/reports/holders?limit=10', key);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.rows));
    assert.ok(r.body.concentration);
  });

  await t.test('limit malformado nao quebra', async () => {
    const r = await get(server, '/api/admin/reports/holders?limit=abc', key);
    assert.equal(r.status, 200, 'cai no default em vez de 500');
  });
});