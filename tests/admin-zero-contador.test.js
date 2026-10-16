// O botao de zerar o contador no admin precisa:
//   1) exigir chave de admin (ninguem sem chave chama)
//   2) nao escrever nada na simulacao
//   3) zerar SO o totalDeposited (saldos, transacoes e contratos intactos)
//   4) gravar backup
//   5) se recusar a rodar de novo depois de feito
const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const origem = path.join(__dirname, '..', 'data.json');
const DB = path.join(os.tmpdir(), 'truckauto-zero-' + process.pid + '.json');
const PORT = 3333;
const B = 'http://127.0.0.1:' + PORT;
const CHAVE = 'admin-teste-123';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let srv = null;

function chamar(metodo, rota, body, chave) {
  const headers = { 'Content-Type': 'application/json' };
  if (chave) headers['x-admin-key'] = chave;
  return fetch(B + '/api/admin' + rota, {
    method: metodo, headers, body: body ? JSON.stringify(body) : undefined
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
}

const ler = () => JSON.parse(fs.readFileSync(DB, 'utf8'));

function semear() {
  const d = ler();
  d.users = d.users.slice(0, 3);
  d.users[0] = Object.assign({}, d.users[0], {
    id: 'usr_z1', phone: '11999000001', operatorName: 'Ana Zero',
    investBalance: 300, earnBalance: 120, balance: 420,
    totalDeposited: 800, totalWithdrawn: 50
  });
  d.users[1] = Object.assign({}, d.users[1], {
    id: 'usr_z2', phone: '11999000002', operatorName: 'Bia Zero',
    investBalance: 0, earnBalance: 40, balance: 40,
    totalDeposited: 30, totalWithdrawn: 0
  });
  d.users[2] = Object.assign({}, d.users[2], {
    id: 'usr_z3', phone: '11999000003', operatorName: 'Cid Zero',
    investBalance: 0, earnBalance: 0, balance: 0,
    totalDeposited: 0, totalWithdrawn: 0
  });
  d.transactions = (d.transactions || []).slice(0, 5).map((t, i) =>
    Object.assign({}, t, { id: 't' + i, userId: 'usr_z1' }));
  d.contracts = [];
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}

before(async () => {
  fs.copyFileSync(origem, DB);
  semear();
  srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      DB_FILE: DB, PORT: String(PORT),
      TELEGRAM_BOT_TOKEN: 'fake:token', ADMIN_TELEGRAM_CHAT_ID: '1',
      ADMIN_KEY: CHAVE
    }),
    stdio: 'ignore'
  });
  await wait(17000);
});

after(() => {
  if (srv) srv.kill();
  try { fs.unlinkSync(DB); } catch (e) { }
});

describe('zero do contador de deposito no admin', () => {
  it('exige a chave de admin', async () => {
    semear();
    const semChave = await chamar('POST', '/zero-contador-deposito', { aplicar: false });
    assert.ok(semChave.status === 401 || semChave.status === 403,
      'sem chave de admin passou: ' + semChave.status);
    const errada = await chamar('POST', '/zero-contador-deposito', { aplicar: false }, 'chave-errada');
    assert.ok(errada.status === 401 || errada.status === 403,
      'chave errada passou: ' + errada.status);
  });

  it('estado mostra quantas contas tem contador', async () => {
    semear();
    const r = await chamar('GET', '/zero-contador-deposito/estado', null, CHAVE);
    assert.equal(r.status, 200);
    assert.equal(r.json.contas, 3);
    assert.equal(r.json.aZerar, 2, 'contas com contador diferente de zero');
    assert.equal(r.json.soma, 830, 'soma: 800 + 30');
  });

  it('simular NAO escreve nada no banco', async () => {
    semear();
    const antes = ler();
    const r = await chamar('POST', '/zero-contador-deposito', { aplicar: false }, CHAVE);
    assert.equal(r.status, 200);
    assert.equal(r.json.aplicado, false, 'a simulacao disse que aplicou');
    assert.equal(r.json.aZerar, 2);
    assert.ok(Array.isArray(r.json.maiores) && r.json.maiores.length > 0, 'simulacao deve listar as maiores');

    const depois = ler();
    assert.equal(depois.users.find(u => u.id === 'usr_z1').totalDeposited, 800,
      'a simulacao ZEROU o contador de verdade');
    assert.deepEqual(antes.users.map(u => u.totalDeposited), depois.users.map(u => u.totalDeposited));
  });

  it('aplicar zera SO o contador e preserva saldo, transacoes e contratos', async () => {
    semear();
    const antes = ler();
    const antesAna = antes.users.find(u => u.id === 'usr_z1');
    const antesBia = antes.users.find(u => u.id === 'usr_z2');
    const txAntes = antes.transactions.length;

    const r = await chamar('POST', '/zero-contador-deposito', { aplicar: true }, CHAVE);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.aplicado, true);
    assert.equal(r.json.zeradas, 2, 'contas zeradas');
    assert.equal(r.json.falhas.length, 0, 'falhas: ' + JSON.stringify(r.json.falhas));

    const d = ler();
    const ana = d.users.find(u => u.id === 'usr_z1');
    const bia = d.users.find(u => u.id === 'usr_z2');

    // O contador zerou
    assert.equal(ana.totalDeposited, 0, 'Ana nao zerou');
    assert.equal(bia.totalDeposited, 0, 'Bia nao zerou');
    assert.equal(d.users.find(u => u.id === 'usr_z3').totalDeposited, 0, 'a que ja estava em zero');

    // Nada mais pode ter mudado
    for (const campo of ['investBalance', 'earnBalance', 'balance', 'totalWithdrawn', 'phone', 'operatorName']) {
      assert.equal(ana[campo], antesAna[campo], 'Ana.' + campo + ' mudou: ' + antesAna[campo] + ' -> ' + ana[campo]);
      assert.equal(bia[campo], antesBia[campo], 'Bia.' + campo + ' mudou: ' + antesBia[campo] + ' -> ' + bia[campo]);
    }
    assert.equal(d.users.length, antes.users.length, 'numero de contas mudou');
    assert.equal(d.transactions.length, txAntes, 'numero de transacoes mudou');
    assert.equal(d.contracts.length, antes.contracts.length, 'contratos mudaram');
  });

  it('grava backup com os valores de antes', async () => {
    const dir = path.join(__dirname, '..', 'backups');
    const arquivos = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('contador-deposito-')) : [];
    assert.ok(arquivos.length > 0, 'nenhum backup gravado');
    const ultimo = arquivos.map(f => path.join(dir, f)).sort().pop();
    const b = JSON.parse(fs.readFileSync(ultimo, 'utf8'));
    assert.ok(Array.isArray(b.contas) && b.contas.length > 0, 'backup sem contas');
    const ana = b.contas.find(c => c.phone === '11999000001');
    assert.equal(ana.totalDepositedAntes, 800, 'backup nao guardou o valor de antes');
  });

  it('recusa rodar de novo depois de ja ter sido feito', async () => {
    const r = await chamar('POST', '/zero-contador-deposito', { aplicar: true }, CHAVE);
    assert.equal(r.status, 409, 'deveria recusar a segunda vez: ' + r.status);
    assert.match(r.json.error, /ja foi zerado/i);
    assert.equal(r.json.aplicado, false);
  });

  it('estado passa a informar que ja foi feito', async () => {
    const r = await chamar('GET', '/zero-contador-deposito/estado', null, CHAVE);
    assert.equal(r.status, 200);
    assert.ok(r.json.jaFoiZeradoEm, 'estado nao guarda a data');
  });
});

describe('o corpo dobrado nao pode mais sabotar a operacao', () => {
  // Ja aconteceu: o painel chamava adminFetch(..., JSON.stringify({...})) e o
  // adminFetch fazia JSON.stringify de novo. O servidor recebia uma string, nao
  // um objeto, entao `aplicar` chegava false e o botao "Zerar contador" so
  // simulava — sem jamais apagar nada.
  it('o painel passa objeto, nao string', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    assert.ok(!/adminFetch\('\/zero-contador-deposito',\s*'POST',\s*JSON\.stringify/.test(html),
      'o painel ainda passa JSON.stringify para o adminFetch (que ja serializa)');
    assert.ok(/adminFetch\('\/zero-contador-deposito',\s*'POST',\s*\{\s*aplicar/.test(html),
      'o painel deveria passar { aplicar: ... }');
  });

  it('corpo dobrado e rejeitado com 400 (por isso o painel tem que passar objeto)', async () => {
    // Este e o bug real que quebrou em producao: o painel passava
    // JSON.stringify(...) para um adminFetch que ja serializa. O corpo virava
    // uma string JSON, o express.json() (modo estrito) recusava com 400 e uma
    // pagina de erro em HTML -- e o painel quebrava tentando ler aquilo como
    // JSON. Este teste existe para lembrar que o corpo tem que ser objeto.
    const r = await fetch(B + '/api/admin/zero-contador-deposito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': CHAVE },
      body: JSON.stringify(JSON.stringify({ aplicar: false }))
    });
    assert.equal(r.status, 400, 'o parser recusaria o corpo dobrado com 400');
  });

  it('objeto normal e aceito', async () => {
    const r = await fetch(B + '/api/admin/zero-contador-deposito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': CHAVE },
      body: JSON.stringify({ aplicar: false })
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.aplicado, false);
    assert.equal(typeof j.aZerar, 'number', 'a simulacao precisa informar quantas contas');
  });
});