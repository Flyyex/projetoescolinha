require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Caminho do banco em arquivo. O padrao e data.json ao lado deste arquivo.
// DB_FILE existe para os testes HTTP poderem apontar para uma copia temporaria:
// sem isso, dois arquivos de teste rodando em paralelo escrevem no mesmo
// data.json (e um teste que caasse pode corromper o dado de verdade).
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(__dirname, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

let pool = null;
const isPostgres = Boolean(DATABASE_URL && DATABASE_URL.trim().length > 0);

if (isPostgres) {
  console.log('[DATABASE] Modo PostgreSQL ativado via DATABASE_URL');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
} else {
  console.log('[DATABASE] DATABASE_URL nÃ£o detectada. Utilizando armazenamento em arquivo local (data.json)');
}

// Catálogo TruckAuto: caminhões autônomos + estações de manutenção.
//
// Preços, rendimentos e duração são IGUAIS aos da FlyEx — a troca de marca não
// mexe em dinheiro. O que muda é o que a pessoa lê: nome e descrição.
const defaultProducts = [
  {
    id: 'NX-030',
    name: 'TruckAuto Urbano',
    category: 'economy',
    status: 'Disponível',
    price: 30.00,
    dailyReturn: 3.80,
    periodDays: 15,
    checkoutUrl: '',
    description: 'Caminhão elétrico compacto para entregas rápidas em rotas urbanas.'
  },
  {
    id: 'NX-101',
    name: 'TruckAuto Volta',
    category: 'economy',
    status: 'Disponível',
    price: 150.00,
    dailyReturn: 11.20,
    periodDays: 30,
    checkoutUrl: '',
    description: 'Caminhão ágil para operações urbanas diárias de entrega.'
  },
  {
    id: 'NX-202',
    name: 'TruckAuto Strada',
    category: 'popular',
    status: 'Alta Demanda',
    price: 350.00,
    dailyReturn: 30.00,
    periodDays: 30,
    checkoutUrl: '',
    description: 'Caminhão com sensores LiDAR e IA de navegação nível 4.'
  },
  {
    id: 'NX-707',
    name: 'TruckAuto Aurora',
    category: 'popular',
    status: 'Alta Demanda',
    price: 600.00,
    dailyReturn: 68.00,
    periodDays: 40,
    checkoutUrl: '',
    description: 'Caminhão com recarga por indução e operação 24/7.'
  },
  {
    id: 'NX-404',
    name: 'TruckAuto Tornado',
    category: 'popular',
    status: 'Alta Demanda',
    price: 900.00,
    dailyReturn: 75.00,
    periodDays: 45,
    checkoutUrl: '',
    description: 'Caminhão de médio porte para transporte de cargas compartilhadas.'
  },
  {
    id: 'NX-303',
    name: 'TruckAuto Atlas',
    category: 'vip',
    status: 'VIP',
    price: 1500.00,
    dailyReturn: 150.00,
    periodDays: 45,
    checkoutUrl: '',
    description: 'Caminhão de alta capacidade operando em rotas corporativas.'
  },
  {
    id: 'NX-505',
    name: 'TruckAuto Titan',
    category: 'vip',
    status: 'VIP',
    price: 2800.00,
    dailyReturn: 150.00,
    periodDays: 60,
    checkoutUrl: '',
    description: 'Caminhão pesado de alta autonomia para operações em áreas densas.'
  },
  {
    id: 'NX-606',
    name: 'TruckAuto Apex',
    category: 'vip',
    status: 'VIP',
    price: 5000.00,
    dailyReturn: 250.00,
    periodDays: 60,
    checkoutUrl: '',
    description: 'Caminhão executivo premium com recarga rápida em 3 min.'
  },
  {
    id: 'CH-050',
    name: 'Estação de Manutenção Urbana 50t',
    category: 'economy',
    status: 'Disponível',
    price: 50.00,
    dailyReturn: 4.50,
    periodDays: 15,
    checkoutUrl: '',
    description: 'Estação de manutenção com pane solar para frotas urbanas compactas.'
  },
  {
    id: 'CH-200',
    name: 'Hub de Manutenção Rápida 250t',
    category: 'popular',
    status: 'Alta Demanda',
    price: 200.00,
    dailyReturn: 19.00,
    periodDays: 30,
    checkoutUrl: '',
    description: 'Hub de manutenção ultrarrápida para caminhões elétricos.'
  },
  {
    id: 'CH-500',
    name: 'Troca Rápida de Pneus e Sistemas',
    category: 'popular',
    status: 'Disponível',
    price: 500.00,
    dailyReturn: 52.00,
    periodDays: 30,
    checkoutUrl: '',
    description: 'Estação robotizada com troca total de pneus e sistemas em 3 minutos.'
  },
  {
    id: 'CH-1200',
    name: 'Central de Manutenção Metropolitana',
    category: 'vip',
    status: 'VIP',
    price: 1200.00,
    dailyReturn: 140.00,
    periodDays: 45,
    checkoutUrl: '',
    description: 'Terminal de manutenção de alta densidade para frotas corporativas.'
  }
];


// i18n catálogo (rascunho IA, revisar no ar): descrições por produto/idioma.
// Nomes próprios não traduzem; status segue tabela fechada abaixo.
const productDescI18n = {
  'NX-030': { es: 'Camión eléctrico compacto para entregas urbanas rápidas y trazado de rutas.', en: 'Compact electric truck for fast urban deliveries and route mapping.', zh: '紧凑型电动货车，适用于快速城市配送和路线规划。' },
  'NX-101': { es: 'Camión ágil para operaciones urbanas diarias de reparto.', en: 'Agile truck for daily urban delivery operations.', zh: '灵活货车，适用于日常城市配送作业。' },
  'NX-202': { es: 'Camión con sensores LiDAR e IA de navegación de nivel 4.', en: 'Truck with LiDAR sensors and level-4 navigation AI.', zh: '搭载激光雷达和L4级导航AI的货车。' },
  'NX-707': { es: 'Camión con carga por inducción y operación 24/7.', en: 'Truck with induction charging and 24/7 operation.', zh: '支持感应充电、可24/7运行的货车。' },
  'NX-404': { es: 'Camión de medio porte para transporte de cargas compartidas.', en: 'Mid-size truck for shared cargo transport.', zh: '中型货车，适用于共享货运。' },
  'NX-303': { es: 'Camión de alta capacidad operando en rutas corporativas.', en: 'High-capacity truck operating on corporate routes.', zh: '大容量货车，运营企业专线。' },
  'NX-505': { es: 'Camión pesado de alta autonomía para operaciones en zonas densas.', en: 'Heavy high-endurance truck for dense-area operations.', zh: '重型长续航货车，适用于密集区域作业。' },
  'NX-606': { es: 'Camión ejecutivo premium con carga rápida en 3 min.', en: 'Premium executive truck with 3-min fast charging.', zh: '高端商务货车，3分钟快速充电。' },
  'CH-050': { es: 'Estación de mantenimiento con panel solar para flotas urbanas compactas.', en: 'Solar-powered maintenance station for compact urban fleets.', zh: '光伏维护站，服务紧凑型城市车队。' },
  'CH-200': { es: 'Hub de mantenimiento ultrarrápido para camiones eléctricos.', en: 'Ultra-fast maintenance hub for electric trucks.', zh: '电动货车超快维护中心。' },
  'CH-500': { es: 'Estación robótica con cambio total de neumáticos y sistemas en 3 minutos.', en: 'Robotic station with full tyre and system swap in 3 minutes.', zh: '机器人维护站，3分钟完成轮胎和系统更换。' },
  'CH-1200': { es: 'Terminal de mantenimiento de alta densidad para flotas corporativas.', en: 'High-density maintenance terminal for corporate fleets.', zh: '高密度维护终端，服务企业车队。' }
};
const productStatusI18n = {
'Disponível': { es: 'Disponible', en: 'Available', zh: '有售' },
'Alta Demanda': { es: 'Alta demanda', en: 'High demand', zh: '热销' },
'VIP': { es: 'VIP', en: 'VIP', zh: 'VIP' }
};
for (const p of defaultProducts) {
  const t = productDescI18n[p.id] || {};
  const s = productStatusI18n[p.status] || {};
  p.name_es = p.name; p.name_en = p.name; p.name_zh = p.name;
  p.description_es = t.es || null; p.description_en = t.en || null; p.description_zh = t.zh || null;
  p.status_es = s.es || null; p.status_en = s.en || null; p.status_zh = s.zh || null;
}

const defaultData = {
  users: [],
  products: defaultProducts,
  contracts: [],
  transactions: []
};


// ==========================================
// LOCAL FILE SYSTEM HELPERS (FALLBACK)
// ==========================================
function readJsonDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultData;
  }
}

function writeJsonDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ==========================================
// POSTGRESQL INITIALIZATION & MIGRATIONS
// ==========================================
async function initDb() {
  if (!isPostgres) {
    const db = readJsonDb();
    // Migração 2 saldos (JSON local): saldo existente vai todo para saque
    let dirty = false;
      for (const u of (db.users || [])) {
      if (u.investBalance === undefined || u.earnBalance === undefined) {
        u.earnBalance = parseFloat(u.balance || 0);
        u.investBalance = 0;
        dirty = true;
      }
      if (!u.inviteCode) {
        u.inviteCode = 'NX' + crypto.randomBytes(4).toString('hex').toUpperCase();
        dirty = true;
      }
    }
    if (dirty) writeJsonDb(db);
    console.log('[DATABASE] Banco local JSON verificado.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('[DATABASE] Conectado ao PostgreSQL. Verificando tabelas...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        operator_name VARCHAR(128) NOT NULL,
        phone VARCHAR(32) UNIQUE NOT NULL,
        cpf_cnpj VARCHAR(20),
        password_hash TEXT NOT NULL,
        invite_code VARCHAR(32) UNIQUE NOT NULL,
        referred_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        balance NUMERIC(14, 2) DEFAULT 0.00,
        invest_balance NUMERIC(14, 2),
        earn_balance NUMERIC(14, 2),
        total_deposited NUMERIC(14, 2) DEFAULT 0.00,
        total_withdrawn NUMERIC(14, 2) DEFAULT 0.00,
        vip_level VARCHAR(32) DEFAULT 'VIP 1',
        last_checkin_date VARCHAR(32),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        category VARCHAR(64) DEFAULT 'economy',
        status VARCHAR(64) DEFAULT 'DisponÃ­vel',
        price NUMERIC(14, 2) NOT NULL,
        daily_return NUMERIC(14, 2) NOT NULL,
        period_days INTEGER NOT NULL,
        checkout_url TEXT,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id VARCHAR(32) NOT NULL,
        product_name VARCHAR(128) NOT NULL,
        daily_return NUMERIC(14, 2) NOT NULL,
        total_days INTEGER NOT NULL,
        days_remaining INTEGER NOT NULL,
        status VARCHAR(32) DEFAULT 'Em corrida',
start_date TIMESTAMPTZ DEFAULT NOW(),
last_settlement TIMESTAMPTZ DEFAULT NOW(),
drip_day VARCHAR(16),
drip_count INTEGER DEFAULT 0
);

      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        amount NUMERIC(14, 2) NOT NULL,
        status VARCHAR(32) DEFAULT 'approved',
        pix_key VARCHAR(128),
        pix_key_type VARCHAR(16),
        description TEXT,
        external_id VARCHAR(128),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        rejected_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        path VARCHAR(255) NOT NULL,
        ip_hash VARCHAR(64) NOT NULL,
        device VARCHAR(32) DEFAULT 'desktop',
        referrer TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at);
      CREATE INDEX IF NOT EXISTS idx_page_views_ip_hash_created ON page_views(ip_hash, created_at);

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(64) DEFAULT 'cartpanda',
        event_type VARCHAR(64),
        amount NUMERIC(14, 2),
        customer_phone VARCHAR(64),
        customer_name VARCHAR(128),
        customer_email VARCHAR(128),
        matched_user_id VARCHAR(64),
        status VARCHAR(64),
        note TEXT,
        raw_payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS promo_codes (
code VARCHAR(64) PRIMARY KEY,
amount NUMERIC(14, 2) NOT NULL,
max_uses INTEGER NOT NULL DEFAULT 1,
used_count INTEGER NOT NULL DEFAULT 0,
active BOOLEAN DEFAULT TRUE,
expires_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS promo_redemptions (
code VARCHAR(64) NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
created_at TIMESTAMPTZ DEFAULT NOW(),
PRIMARY KEY (code, user_id)
);
CREATE TABLE IF NOT EXISTS pix_charges (
identifier VARCHAR(128) PRIMARY KEY,
provider VARCHAR(32) NOT NULL DEFAULT '',
user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
amount NUMERIC(14, 2) NOT NULL,
status VARCHAR(32) DEFAULT 'pending',
created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS support_messages (
id SERIAL PRIMARY KEY,
user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
sender VARCHAR(16) NOT NULL DEFAULT 'user',
text TEXT NOT NULL,
is_read BOOLEAN DEFAULT FALSE,
created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id, created_at);
CREATE TABLE IF NOT EXISTS support_threads (
id SERIAL PRIMARY KEY,
user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
status VARCHAR(16) NOT NULL DEFAULT 'open',
created_at TIMESTAMPTZ DEFAULT NOW(),
closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_support_threads_user ON support_threads(user_id, status);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS thread_id INTEGER;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_status VARCHAR(32) DEFAULT 'new';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_notes TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(128);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_balance NUMERIC(14, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_returns_balance NUMERIC(14, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS career_rank VARCHAR(64) DEFAULT 'bronze';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS force_level3_unlocked BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20);
      -- Fase 2: IP de cadastro (hash) para velocidade anti-farm por IP
      ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invest_balance NUMERIC(14, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS earn_balance NUMERIC(14, 2);
-- Migração 2 saldos: saldo existente vai todo para saque (ninguém perde nada)
UPDATE users SET earn_balance = COALESCE(balance, 0), invest_balance = 0 WHERE earn_balance IS NULL AND invest_balance IS NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id VARCHAR(128);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ad_reported_at TIMESTAMPTZ;
    -- Programa Social: 1 video aprovado = R$ 1,00 no saldo Investir.
    -- url_hash UNIQUE e a barreira anti-duplicata: sem ela o mesmo video
    -- reenviado (com query de rastreio diferente) pagaria duas vezes.
    CREATE TABLE IF NOT EXISTS social_posts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      video_url TEXT NOT NULL,
      url_hash VARCHAR(64) UNIQUE,
      network VARCHAR(16),
      handle VARCHAR(64),
      status VARCHAR(16) DEFAULT 'pending',
      reject_reason TEXT,
      reward NUMERIC(14, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS url_hash VARCHAR(64);
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reject_reason TEXT;
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reward NUMERIC(14, 2) DEFAULT 0;
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status, created_at);
    -- "Um video pendente por pessoa" vira regra do BANCO, nao da aplicacao.
    -- Contar e depois inserir tinha uma janela entre os dois (3 envios
    -- simultaneos criavam 3 pendentes e 3 candidatas a R$ 1,00).
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_um_pendente
      ON social_posts (user_id) WHERE status = 'pending';
    -- Aprovado sem credito: o admin precisa enxergar para nao achar que pagou.
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;
-- Tipo da chave Pix escolhido pelo operador (evita adivinhacao no payout)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(16);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS drip_day VARCHAR(16);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS drip_count INTEGER DEFAULT 0;
-- i18n catálogo: nome/desc/status por idioma (vazio = cai no PT)
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_es VARCHAR(128);
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en VARCHAR(128);
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_zh VARCHAR(128);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_es TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_zh TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS status_es VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS status_en VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS status_zh VARCHAR(64);

      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

// Semeia produtos caso a tabela esteja vazia
const prodRes = await client.query('SELECT COUNT(*) FROM products');

if (parseInt(prodRes.rows[0].count, 10) === 0) {
console.log('[DATABASE] Populando catálogo inicial...');
for (const p of defaultProducts) {
await client.query(`
INSERT INTO products (id, name, category, status, price, daily_return, period_days, checkout_url, description,
name_es, name_en, name_zh, description_es, description_en, description_zh, status_es, status_en, status_zh)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
`, [p.id, p.name, p.category, p.status, p.price, p.dailyReturn, p.periodDays, p.checkoutUrl, p.description,
p.name_es || p.name, p.name_en || p.name, p.name_zh || p.name,
p.description_es || null, p.description_en || null, p.description_zh || null,
p.status_es || null, p.status_en || null, p.status_zh || null]);
}
}
// Garante produtos novos (ex: pontos de carregamento) sem duplicar os existentes
for (const p of defaultProducts) {
await client.query(`
INSERT INTO products (id, name, category, status, price, daily_return, period_days, checkout_url, description,
name_es, name_en, name_zh, description_es, description_en, description_zh, status_es, status_en, status_zh)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
ON CONFLICT (id) DO NOTHING
`, [p.id, p.name, p.category, p.status, p.price, p.dailyReturn, p.periodDays, p.checkoutUrl, p.description,
p.name_es || p.name, p.name_en || p.name, p.name_zh || p.name,
p.description_es || null, p.description_en || null, p.description_zh || null,
p.status_es || null, p.status_en || null, p.status_zh || null]);
}
// Backfill i18n: produtos antigos ganham as traduções do seed onde estiver vazio
for (const p of defaultProducts) {
try {
await client.query(`
UPDATE products SET
name_es = COALESCE(NULLIF(name_es, ''), $2), name_en = COALESCE(NULLIF(name_en, ''), $3), name_zh = COALESCE(NULLIF(name_zh, ''), $4),
description_es = COALESCE(NULLIF(description_es, ''), $5), description_en = COALESCE(NULLIF(description_en, ''), $6), description_zh = COALESCE(NULLIF(description_zh, ''), $7),
status_es = COALESCE(NULLIF(status_es, ''), $8), status_en = COALESCE(NULLIF(status_en, ''), $9), status_zh = COALESCE(NULLIF(status_zh, ''), $10)
WHERE id = $1 AND (name_es IS NULL OR name_en IS NULL OR name_zh IS NULL OR description_es IS NULL OR description_en IS NULL OR description_zh IS NULL OR status_es IS NULL OR status_en IS NULL OR status_zh IS NULL)
`, [p.id, p.name_es || p.name, p.name_en || p.name, p.name_zh || p.name,
p.description_es || null, p.description_en || null, p.description_zh || null,
p.status_es || null, p.status_en || null, p.status_zh || null]);
} catch (e) { console.error('[DATABASE] backfill i18n produto ' + p.id + ':', e.message); }
}

    console.log('[DATABASE] Tabelas PostgreSQL inicializadas com sucesso!');
    // Backfill: contas antigas sem inviteCode ganham um (links NEXO... passam a valer)
    try {
      const noCode = await client.query("SELECT id FROM users WHERE invite_code IS NULL OR invite_code = ''");
      for (const r of (noCode.rows || [])) {
        await client.query('UPDATE users SET invite_code = $1 WHERE id = $2', ['NX' + crypto.randomBytes(4).toString('hex').toUpperCase(), r.id]);
      }
      if ((noCode.rows || []).length) console.log('[DATABASE] Invite codes gerados para ' + noCode.rows.length + ' contas.');
    } catch (e) {
      console.error('[DATABASE] backfill inviteCode:', e.message);
    }
  } catch (err) {
    console.error('[DATABASE ERROR] Erro na inicializaÃ§Ã£o do PostgreSQL:', err);
  } finally {
    client.release();
  }
}

// Helpers para mapeamento de colunas Postgres <-> camelCase
function mapUser(row) {
  if (!row) return null;
  const bal = parseFloat(row.balance || 0);
  const comm = row.commission_balance !== undefined && row.commission_balance !== null ? parseFloat(row.commission_balance) : bal;
  const daily = row.daily_returns_balance !== undefined && row.daily_returns_balance !== null ? parseFloat(row.daily_returns_balance) : 0;

  return {
    id: row.id,
    operatorName: row.operator_name,
    phone: row.phone,
    cpfCnpj: row.cpf_cnpj || null,
    passwordHash: row.password_hash,
    inviteCode: row.invite_code,
    referredBy: row.referred_by,
    balance: bal,
    investBalance: parseFloat(row.invest_balance || 0),
    earnBalance: parseFloat(row.earn_balance || 0),
    commissionBalance: comm,
    dailyReturnsBalance: daily,
    careerRank: row.career_rank || 'bronze',
    forceLevel3Unlocked: Boolean(row.force_level3_unlocked),
    totalDeposited: parseFloat(row.total_deposited || 0),
    totalWithdrawn: parseFloat(row.total_withdrawn || 0),
    vipLevel: row.vip_level,
    lastCheckinDate: row.last_checkin_date,
    crmStatus: row.crm_status || 'new',
    crmNotes: row.crm_notes || '',
    utmSource: row.utm_source || null,
    utmCampaign: row.utm_campaign || null,
    utmMedium: row.utm_medium || null,
    createdAt: row.created_at
  };
}

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    name_es: row.name_es || row.nameEs || null,
    name_en: row.name_en || row.nameEn || null,
    name_zh: row.name_zh || row.nameZh || null,
    category: row.category,
    status: row.status,
    status_es: row.status_es || row.statusEs || null,
    status_en: row.status_en || row.statusEn || null,
    status_zh: row.status_zh || row.statusZh || null,
    price: parseFloat(row.price || 0),
    dailyReturn: parseFloat(row.daily_return || 0),
    periodDays: parseInt(row.period_days, 10),
    checkoutUrl: row.checkout_url,
    description: row.description,
    description_es: row.description_es || row.descriptionEs || null,
    description_en: row.description_en || row.descriptionEn || null,
    description_zh: row.description_zh || row.descriptionZh || null
  };
}

function mapContract(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    productName: row.product_name,
    dailyReturn: parseFloat(row.daily_return || 0),
    totalDays: parseInt(row.total_days, 10),
    daysRemaining: parseInt(row.days_remaining, 10),
status: row.status,
startDate: row.start_date,
lastSettlement: row.last_settlement,
dripDay: row.drip_day || row.dripDay || null,
dripCount: parseInt(row.drip_count ?? row.dripCount ?? 0, 10) || 0
};
}

function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount || 0),
    status: row.status,
    pixKey: row.pix_key,
    pixKeyType: row.pix_key_type || row.pixKeyType || null,
    description: row.description,
    externalId: row.external_id || row.externalId || null,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    adReportedAt: row.ad_reported_at || null
  };
}

// ==========================================
// UNIFIED ASYNC DATA ACCESS LAYER
// ==========================================

// --- USERS ---
async function findUserById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return mapUser(res.rows[0]);
  }
  const db = readJsonDb();
  return db.users.find(u => u.id === id) || null;
}

async function findUserByPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;

  // Monta conjunto de candidatos
  const candidates = new Set();
  candidates.add(digits);
  candidates.add(String(phone).trim());

  if (digits.startsWith('55') && digits.length >= 10) {
    candidates.add(digits.substring(2)); // sem 55
  } else if (!digits.startsWith('55')) {
    candidates.add('55' + digits); // com 55
  }

  // Tratamento inteligente do 9Âº dÃ­gito mÃ³vel
  const ddd = digits.startsWith('55') ? digits.substring(2, 4) : digits.substring(0, 2);
  const numberPart = digits.startsWith('55') ? digits.substring(4) : digits.substring(2);

  if (numberPart.length === 8) {
    const with9 = ddd + '9' + numberPart;
    candidates.add(with9);
    candidates.add('55' + with9);
  } else if (numberPart.length === 9 && numberPart.startsWith('9')) {
    const without9 = ddd + numberPart.substring(1);
    candidates.add(without9);
    candidates.add('55' + without9);
  }

  const candidateArray = Array.from(candidates);

  if (isPostgres) {
    // 1. Busca exata por qualquer uma das variaÃ§Ãµes formatadas
    const res = await pool.query(
      'SELECT * FROM users WHERE phone = ANY($1::varchar[]) LIMIT 1',
      [candidateArray]
    );
    if (res.rows.length > 0) {
      return mapUser(res.rows[0]);
    }

    // 2. Busca por sufixo dos Ãºltimos 8 dÃ­gitos (garante matching mesmo com divergÃªncia de DDD/formato)
    if (digits.length >= 8) {
      const suffix = digits.slice(-8);
      const resSuffix = await pool.query(
        "SELECT * FROM users WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 8) = $1 LIMIT 1",
        [suffix]
      );
      if (resSuffix.rows.length > 0) {
        return mapUser(resSuffix.rows[0]);
      }
    }

    return null;
  }

  const db = readJsonDb();
  for (const c of candidateArray) {
    const found = db.users.find(u => (u.phone || '').replace(/\D/g, '') === c.replace(/\D/g, ''));
    if (found) return found;
  }
  if (digits.length >= 8) {
    const suffix = digits.slice(-8);
    const found = db.users.find(u => ((u.phone || '').replace(/\D/g, '')).endsWith(suffix));
    if (found) return found;
  }
  return null;
}

async function findUserByInviteCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users WHERE UPPER(invite_code) = $1', [upper]);
    return mapUser(res.rows[0]);
  }
  const db = readJsonDb();
  return db.users.find(u => (u.inviteCode || '').toUpperCase() === upper) || null;
}

// IDs e códigos com entropia criptográfica + verificação anti-colisão
function newUserId() {
  return 'usr_' + crypto.randomBytes(8).toString('hex');
}
async function newInviteCode() {
  for (let i = 0; i < 10; i++) {
    const code = 'NX' + crypto.randomBytes(4).toString('hex').toUpperCase();
    if (!(await findUserByInviteCode(code))) return code;
  }
  return 'NX' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}
function newContractId() {
  return 'CTR-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function createUser(user) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO users (id, operator_name, phone, password_hash, invite_code, referred_by, balance, invest_balance, earn_balance, total_deposited, total_withdrawn, vip_level, last_checkin_date, utm_source, utm_campaign, utm_medium, register_ip_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      user.id,
      user.operatorName,
      user.phone,
      user.passwordHash,
      user.inviteCode,
      user.referredBy || null,
      user.balance || 0,
      user.investBalance || 0,
      user.earnBalance || 0,
      user.totalDeposited || 0,
      user.totalWithdrawn || 0,
      user.vipLevel || 'VIP 1',
      user.lastCheckinDate || null,
      user.utmSource || null,
      user.utmCampaign || null,
      user.utmMedium || null,
      user.registerIpHash || null,
      user.createdAt || new Date().toISOString()
    ]);
    return user;
  }

  const db = readJsonDb();
  if (user.investBalance === undefined) user.investBalance = 0;
  if (user.earnBalance === undefined) user.earnBalance = 0;
  db.users.push(user);
  writeJsonDb(db);
  return user;
}

async function updateUser(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.balance !== undefined) {
      setClauses.push(`balance = $${idx++}`);
      values.push(fields.balance);
    }
    if (fields.totalDeposited !== undefined) {
      setClauses.push(`total_deposited = $${idx++}`);
      values.push(fields.totalDeposited);
    }
    if (fields.totalWithdrawn !== undefined) {
      setClauses.push(`total_withdrawn = $${idx++}`);
      values.push(fields.totalWithdrawn);
    }
    if (fields.lastCheckinDate !== undefined) {
      setClauses.push(`last_checkin_date = $${idx++}`);
      values.push(fields.lastCheckinDate);
    }
    if (fields.vipLevel !== undefined) {
      setClauses.push(`vip_level = $${idx++}`);
      values.push(fields.vipLevel);
    }
    if (fields.operatorName !== undefined) {
      setClauses.push(`operator_name = $${idx++}`);
      values.push(fields.operatorName);
    }
    if (fields.inviteCode !== undefined) {
      setClauses.push(`invite_code = $${idx++}`);
      values.push(fields.inviteCode);
    }
    if (fields.commissionBalance !== undefined) {
      setClauses.push(`commission_balance = $${idx++}`);
      values.push(fields.commissionBalance);
    }
    if (fields.dailyReturnsBalance !== undefined) {
      setClauses.push(`daily_returns_balance = $${idx++}`);
      values.push(fields.dailyReturnsBalance);
    }
    if (fields.careerRank !== undefined) {
      setClauses.push(`career_rank = $${idx++}`);
      values.push(fields.careerRank);
    }
    if (fields.forceLevel3Unlocked !== undefined) {
      setClauses.push(`force_level3_unlocked = $${idx++}`);
      values.push(fields.forceLevel3Unlocked);
    }
    if (fields.crmStatus !== undefined) {
      setClauses.push(`crm_status = $${idx++}`);
      values.push(fields.crmStatus);
    }
    if (fields.crmNotes !== undefined) {
      setClauses.push(`crm_notes = $${idx++}`);
      values.push(fields.crmNotes);
    }
    if (fields.cpfCnpj !== undefined) {
      setClauses.push(`cpf_cnpj = $${idx++}`);
      values.push(fields.cpfCnpj);
    }
    if (fields.investBalance !== undefined) {
      setClauses.push(`invest_balance = $${idx++}`);
      values.push(fields.investBalance);
    }
    if (fields.earnBalance !== undefined) {
      setClauses.push(`earn_balance = $${idx++}`);
      values.push(fields.earnBalance);
    }
    // Incrementos atômicos (evitam perda em créditos concorrentes)
    if (fields.balanceInc !== undefined) {
      setClauses.push(`balance = COALESCE(balance, 0) + $${idx++}`);
      values.push(fields.balanceInc);
    }
    if (fields.investBalanceInc !== undefined) {
      setClauses.push(`invest_balance = COALESCE(invest_balance, 0) + $${idx++}`);
      values.push(fields.investBalanceInc);
    }
    if (fields.earnBalanceInc !== undefined) {
      setClauses.push(`earn_balance = COALESCE(earn_balance, 0) + $${idx++}`);
      values.push(fields.earnBalanceInc);
    }
    if (fields.totalDepositedInc !== undefined) {
      setClauses.push(`total_deposited = COALESCE(total_deposited, 0) + $${idx++}`);
      values.push(fields.totalDepositedInc);
    }
    if (fields.totalWithdrawnInc !== undefined) {
      setClauses.push(`total_withdrawn = COALESCE(total_withdrawn, 0) + $${idx++}`);
      values.push(fields.totalWithdrawnInc);
    }

    if (setClauses.length === 0) return await findUserById(id);

    values.push(id);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapUser(res.rows[0]);
  }

  const db = readJsonDb();
  const user = db.users.find(u => u.id === id);
  if (user) {
    const inc = (k, f) => { if (fields[f] !== undefined) user[k] = Math.round(((parseFloat(user[k] || 0) + parseFloat(fields[f])) * 100)) / 100; };
    inc('balance', 'balanceInc');
    inc('investBalance', 'investBalanceInc');
    inc('earnBalance', 'earnBalanceInc');
    inc('totalDeposited', 'totalDepositedInc');
    inc('totalWithdrawn', 'totalWithdrawnInc');
    const { balanceInc, investBalanceInc, earnBalanceInc, totalDepositedInc, totalWithdrawnInc, ...rest } = fields;
    Object.assign(user, rest);
    writeJsonDb(db);
  }
  return user;
}

async function deleteUser(id) {
  if (!id) return false;
  if (isPostgres) {
    const res = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }
  const db = readJsonDb();
  const before = (db.users || []).length;
  db.users = (db.users || []).filter(u => u.id !== id);
  if (Array.isArray(db.contracts)) db.contracts = db.contracts.filter(c => c.userId !== id && c.user_id !== id);
  if (Array.isArray(db.transactions)) db.transactions = db.transactions.filter(t => t.userId !== id && t.user_id !== id);
  writeJsonDb(db);
  return (db.users || []).length < before;
}

async function getAllUsers() {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return res.rows.map(mapUser);
  }
  const db = readJsonDb();
  return db.users;
}

// Fase 2: quantas contas nasceram deste IP (hash) desde `sinceIso` (janela rolante).
async function countUsersByIpSince(ipHash, sinceIso) {
  if (!ipHash) return 0;
  if (isPostgres) {
    try {
      const res = await pool.query(
        'SELECT COUNT(*) FROM users WHERE register_ip_hash = $1 AND created_at >= $2',
        [ipHash, sinceIso]
      );
      return parseInt(res.rows[0].count, 10) || 0;
    } catch (e) {
      return 0;
    }
  }
  const db = readJsonDb();
  const since = new Date(sinceIso).getTime();
  return (db.users || []).filter(u => {
    const h = u.registerIpHash || u.register_ip_hash;
    if (h !== ipHash) return false;
    const ts = new Date(u.createdAt || u.created_at).getTime();
    return isFinite(ts) && ts >= since;
  }).length;
}

// --- PRODUCTS ---
async function getAllProducts() {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM products ORDER BY price ASC');
    return res.rows.map(mapProduct);
  }
  const db = readJsonDb();
  return db.products;
}

async function findProductById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return mapProduct(res.rows[0]);
  }
  const db = readJsonDb();
  return db.products.find(p => p.id === id) || null;
}

async function updateProduct(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.checkoutUrl !== undefined) {
      setClauses.push(`checkout_url = $${idx++}`);
      values.push(fields.checkoutUrl);
    }
    if (fields.price !== undefined) {
      setClauses.push(`price = $${idx++}`);
      values.push(fields.price);
    }
if (fields.dailyReturn !== undefined) {
setClauses.push(`daily_return = $${idx++}`);
values.push(fields.dailyReturn);
}
if (fields.periodDays !== undefined) {
setClauses.push(`period_days = $${idx++}`);
values.push(fields.periodDays);
}
    if (fields.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(fields.name);
    }
    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }
    if (fields.description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      values.push(fields.description);
    }
    const i18nCols = ['name_es', 'name_en', 'name_zh', 'description_es', 'description_en', 'description_zh', 'status_es', 'status_en', 'status_zh'];
    for (const col of i18nCols) {
      const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v = fields[col] !== undefined ? fields[col] : fields[camel];
      if (v !== undefined) {
        setClauses.push(`${col} = $${idx++}`);
        values.push(v || null);
      }
    }

    if (setClauses.length === 0) return await findProductById(id);

    values.push(id);
    const query = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapProduct(res.rows[0]);
  }

  const db = readJsonDb();
  const prod = db.products.find(p => p.id === id);
  if (prod) {
    Object.assign(prod, fields);
    writeJsonDb(db);
  }
  return prod;
}

// --- CONTRACTS ---

async function getContractsByUserId(userId) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM contracts WHERE user_id = $1 ORDER BY start_date DESC', [userId]);
    return res.rows.map(mapContract);
  }
  const db = readJsonDb();
  return db.contracts.filter(c => c.userId === userId);
}

async function getAllActiveContracts() {
  if (isPostgres) {
    const res = await pool.query("SELECT * FROM contracts WHERE status = 'Em corrida' AND days_remaining > 0");
    return res.rows.map(mapContract);
  }
  const db = readJsonDb();
  return db.contracts.filter(c => c.status === 'Em corrida' && c.daysRemaining > 0);
}

async function createContract(contract) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO contracts (id, user_id, product_id, product_name, daily_return, total_days, days_remaining, status, start_date, last_settlement)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      contract.id,
      contract.userId,
      contract.productId,
      contract.productName,
      contract.dailyReturn,
      contract.totalDays,
      contract.daysRemaining,
      contract.status || 'Em corrida',
      contract.startDate || new Date().toISOString(),
      contract.lastSettlement || new Date().toISOString()
    ]);
    return contract;
  }

  const db = readJsonDb();
  db.contracts.unshift(contract);
  writeJsonDb(db);
  return contract;
}

async function updateContract(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.daysRemaining !== undefined) {
      setClauses.push(`days_remaining = $${idx++}`);
      values.push(fields.daysRemaining);
    }
    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }
if (fields.lastSettlement !== undefined) {
setClauses.push(`last_settlement = $${idx++}`);
values.push(fields.lastSettlement);
}
if (fields.dripDay !== undefined) {
setClauses.push(`drip_day = $${idx++}`);
values.push(fields.dripDay);
}
if (fields.dripCount !== undefined) {
setClauses.push(`drip_count = $${idx++}`);
values.push(fields.dripCount);
}

    if (setClauses.length === 0) return;

    values.push(id);
    await pool.query(`UPDATE contracts SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    return;
  }

  const db = readJsonDb();
  const c = db.contracts.find(item => item.id === id);
  if (c) {
    Object.assign(c, fields);
    writeJsonDb(db);
  }
}

async function deleteContract(id) {
if (!id) return false;
if (isPostgres) {
const res = await pool.query('DELETE FROM contracts WHERE id = $1', [id]);
return (res.rowCount || 0) > 0;
}
const db = readJsonDb();
const before = (db.contracts || []).length;
db.contracts = (db.contracts || []).filter(item => item.id !== id);
writeJsonDb(db);
return (db.contracts || []).length < before;
}

// --- TRANSACTIONS ---
async function getTransactionsByUserId(userId) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows.map(mapTransaction);
  }
  const db = readJsonDb();
  return db.transactions.filter(t => t.userId === userId);
}

// Quanto o operador já sacou DE VERDADE: soma só dos saques aprovados.
// Não usa users.total_withdrawn porque esse campo já contava a solicitação
// pendente e carregava divergência histórica (2 de 29 operadores não batiam
// com a soma dos aprovados). Serve para o alerta de saque no Telegram.
// ============ PROGRAMA SOCIAL ============
// Premio fixo de 1,00 por video aprovado. NUNCA lido do corpo da requisicao:
// se o valor viesse de fora, qualquer um com a chave do admin creditava o
// quanto quisesse. A duplicata com services/social.js REWARD_AMOUNT e
// intencional (database.js nao importa services/); tests/social-db.test.js
// trava que as duas nao divergem.

const SOCIAL_REWARD = 1.00;

function newSocialPostId() {
  return 'SP' + crypto.randomBytes(8).toString('hex');
}

function mapSocialPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    videoUrl: row.video_url || row.videoUrl,
    urlHash: row.url_hash || row.urlHash || null,
    network: row.network,
    handle: row.handle,
    status: row.status,
    rejectReason: row.reject_reason || row.rejectReason || null,
    reward: parseFloat(row.reward || 0),
    creditedAt: row.credited_at || row.creditedAt || null,
    // Aprovado mas o credito nunca foi confirmado: a fila do admin mostra
    // isso para o pagamento nao passar despercebido.
    precisaCredito: (row.status === 'approved') && !(row.credited_at || row.creditedAt),
    createdAt: row.created_at || row.createdAt,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    operatorName: row.operator_name !== undefined ? row.operator_name : row.operatorName,
    phone: row.phone,
    approvedBefore: row.approved_before !== undefined && row.approved_before !== null
      ? parseInt(row.approved_before, 10) : undefined
  };
}

async function createSocialPost(userId, { url, urlHash, network, handle }) {
  const id = newSocialPostId();
  if (isPostgres) {
    try {
      const res = await pool.query(
        `INSERT INTO social_posts (id, user_id, video_url, url_hash, network, handle, status, reward)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0) RETURNING *`,
        [id, userId, url, urlHash, network, handle || null]
      );
      return mapSocialPost(res.rows[0]);
    } catch (e) {
      // 23505 = unique_violation. Dois indices podem violar:
      //   url_hash  -> este video ja foi enviado
      //   um_pendente -> a pessoa ja tem um video em analise
      const msg = String(e.message || '');
      if (String(e.code) === '23505') {
        if (/um_pendente/.test(msg)) return { error: 'Você já tem um vídeo pendente de análise. Aguarde o admin responder.' };
        return { error: 'Este vídeo já foi enviado.' };
      }
      throw e;
    }
  }
  // No modo arquivo, contagem e insercao acontecem no MESMO tick sincrono --
  // nao ha await entre elas, entao nao existe janela para duas requisicoes.
  const db = readJsonDb();
  db.social_posts = db.social_posts || [];
  const jaTemPendente = db.social_posts.some(p => p.userId === userId && p.status === 'pending');
  if (jaTemPendente) {
    return { error: 'Você já tem um vídeo pendente de análise. Aguarde o admin responder.' };
  }
  // Recusado NAO bloqueia: o hash e liberado no momento da recusa (ver
  // rejectSocialPost), entao so entra aqui quem ainda esta pending/approved.
  if (urlHash && db.social_posts.some(p => p.urlHash === urlHash)) {
    return { error: 'Este vídeo já foi enviado.' };
  }
  const post = {
    id, userId,
    videoUrl: url,
    urlHash: urlHash || null,
    network: network || 'tiktok',
    handle: handle || '',
    status: 'pending',
    rejectReason: null,
    reward: 0,
    creditedAt: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null
  };
  db.social_posts.push(post);
  writeJsonDb(db);
  return mapSocialPost(post);
}

// Soma do que a pessoa JA GANHOU, sem teto. getUserSocialPosts tem LIMIT 100,
// entao somar em cima da lista saturava em R$ 100 e a tela mentia.
async function getUserEarnedTotal(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT COALESCE(SUM(reward), 0) AS total, COUNT(*)::int AS n
         FROM social_posts WHERE user_id = $1 AND status = 'approved'`, [userId]);
    return {
      total: Math.round(parseFloat((res.rows[0] && res.rows[0].total) || 0) * 100) / 100,
      count: (res.rows[0] && res.rows[0].n) || 0
    };
  }
  const lista = (readJsonDb().social_posts || []).filter(p => p.userId === userId && p.status === 'approved');
  const soma = lista.reduce((a, p) => a + parseFloat(p.reward || 0), 0);
  return { total: Math.round(soma * 100) / 100, count: lista.length };
}

async function getSocialPostById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM social_posts WHERE id = $1', [id]);
    return mapSocialPost(res.rows[0]);
  }
  const db = readJsonDb();
  return mapSocialPost((db.social_posts || []).find(p => p.id === id));
}

async function getUserSocialPosts(userId) {
  if (isPostgres) {
    const res = await pool.query(
      'SELECT * FROM social_posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]);
    return res.rows.map(mapSocialPost);
  }
  const db = readJsonDb();
  return (db.social_posts || [])
    .filter(p => p.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100)
    .map(mapSocialPost);
}

// Fila do admin: pendentes primeiro, e DEPOIS os aprovados que nunca foram
// creditados. Um post aprovado sem credito nao pode sumir da tela: para o admin
// seria "pago" sem o dinheiro ter entrado.
async function getPendingSocialPosts() {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT s.*, u.operator_name, u.phone,
              (SELECT COUNT(*)::int FROM social_posts a
                WHERE a.user_id = s.user_id AND a.status = 'approved'
                  AND a.credited_at IS NOT NULL) AS approved_before
         FROM social_posts s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.status = 'pending'
           OR (s.status = 'approved' AND s.credited_at IS NULL)
        ORDER BY (s.status = 'pending') DESC, s.created_at ASC LIMIT 200`);
    return res.rows.map(mapSocialPost);
  }
  const db = readJsonDb();
  const users = db.users || [];
  const posts = db.social_posts || [];
  const naoCreditados = (p) => p.status === 'approved' && !p.creditedAt;
  return posts
    .filter(p => p.status === 'pending' || naoCreditados(p))
    .sort((a, b) => {
      const pa = a.status === 'pending' ? 0 : 1;
      const pb = b.status === 'pending' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt) - new Date(b.createdAt);
    })
    .slice(0, 200)
    .map(p => {
      const u = users.find(x => x.id === p.userId);
      return mapSocialPost({
        ...p,
        operator_name: u ? u.operatorName : null,
        phone: u ? u.phone : null,
        approved_before: posts.filter(
          x => x.userId === p.userId && x.status === 'approved' && x.creditedAt
        ).length
      });
    });
}

// Marca que o R$ 1 foi efetivamente creditado no saldo. Sem isso o admin nunca
// saberia se o pagamento aconteceu.
async function markSocialCredited(id) {
  const agora = new Date().toISOString();
  if (isPostgres) {
    const res = await pool.query(
      `UPDATE social_posts SET credited_at=$1 WHERE id=$2 AND credited_at IS NULL`, [agora, id]);
    return (res.rowCount || 0) > 0;
  }
  const db = readJsonDb();
  const p = (db.social_posts || []).find(x => x.id === id);
  if (!p || p.creditedAt) return false;
  p.creditedAt = agora;
  writeJsonDb(db);
  return true;
}

async function countPendingSocialByUser(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM social_posts WHERE user_id = $1 AND status = 'pending'`, [userId]);
    return (res.rows[0] && res.rows[0].n) || 0;
  }
  return (readJsonDb().social_posts || [])
    .filter(p => p.userId === userId && p.status === 'pending').length;
}

async function countApprovedSocialByUser(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM social_posts WHERE user_id = $1 AND status = 'approved'`, [userId]);
    return (res.rows[0] && res.rows[0].n) || 0;
  }
  return (readJsonDb().social_posts || [])
    .filter(p => p.userId === userId && p.status === 'approved').length;
}

// Aprovacao ATOMICA. O UPDATE so atinge a linha se ela ainda for 'pending'.
// Duas aprovacoes simultaneas disputam o mesmo row: uma afeta 1 linha e segue,
// a outra afeta 0 e recebe alreadyDone. E isso que impede pagamento duplicado
// sem depender da UI -- clique duplo, F5 e duas abas nao pagam duas vezes.
async function approveSocialPost(id) {
  if (isPostgres) {
    const res = await pool.query(
      `UPDATE social_posts SET status='approved', reward=$1, reviewed_at=NOW()
        WHERE id=$2 AND status='pending' RETURNING *`,
      [SOCIAL_REWARD, id]);
    if (!res.rows.length) {
      const atual = await getSocialPostById(id);
      return { ok: false, alreadyDone: true, error: 'Este vídeo já foi analisado.', post: atual };
    }
    return { ok: true, post: mapSocialPost(res.rows[0]) };
  }
  const db = readJsonDb();
  const p = (db.social_posts || []).find(x => x.id === id);
  if (!p) return { ok: false, error: 'Vídeo não encontrado.' };
  if (p.status !== 'pending') {
    return { ok: false, alreadyDone: true, error: 'Este vídeo já foi analisado.', post: mapSocialPost(p) };
  }
  p.status = 'approved';
  p.reward = SOCIAL_REWARD;
  p.reviewedAt = new Date().toISOString();
  writeJsonDb(db);
  return { ok: true, post: mapSocialPost(p) };
}

async function rejectSocialPost(id, reason) {
  const texto = String(reason || '').trim() || 'Não atende aos critérios da campanha.';
  // Liberar o hash e o que permite a pessoa reenviar depois de corrigir o
  // video. No Postgres url_hash tem UNIQUE, entao precisa virar NULL (nao pode
  // ir para '' ou repetiria). O historico continua na row, so o hash some.
  if (isPostgres) {
    const res = await pool.query(
      `UPDATE social_posts SET status='rejected', reject_reason=$1, url_hash=NULL, reviewed_at=NOW()
        WHERE id=$2 AND status='pending' RETURNING *`,
      [texto, id]);
    if (!res.rows.length) {
      const atual = await getSocialPostById(id);
      return { ok: false, alreadyDone: true, error: 'Este vídeo já foi analisado.', post: atual };
    }
    return { ok: true, post: mapSocialPost(res.rows[0]) };
  }
  const db = readJsonDb();
  const p = (db.social_posts || []).find(x => x.id === id);
  if (!p) return { ok: false, error: 'Vídeo não encontrado.' };
  if (p.status !== 'pending') {
    return { ok: false, alreadyDone: true, error: 'Este vídeo já foi analisado.', post: mapSocialPost(p) };
  }
  p.status = 'rejected';
  p.rejectReason = texto;
  p.urlHash = null;
  p.reviewedAt = new Date().toISOString();
  writeJsonDb(db);
  return { ok: true, post: mapSocialPost(p) };
}

// O total pago no mes e o numero que o admin olha para decidir se precisa
// frear. Nao ha limite no sistema: o freio e politica dele.
async function getSocialStats() {
  const inicio = new Date();
  inicio.setUTCDate(1);
  inicio.setUTCHours(0, 0, 0, 0);
  const inicioIso = inicio.toISOString();

  if (isPostgres) {
    const res = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='pending')::int  AS pending,
         COUNT(*) FILTER (WHERE status='approved')::int  AS approved_count,
         COUNT(*) FILTER (WHERE status='rejected')::int  AS rejected_count,
         COALESCE(SUM(reward) FILTER (WHERE status='approved'), 0)         AS paid_total,
         COALESCE(SUM(reward) FILTER (WHERE status='approved' AND reviewed_at >= $1), 0) AS paid_month
       FROM social_posts`,
      [inicioIso]);
    const r = res.rows[0] || {};
    return {
      pending: r.pending || 0,
      approvedCount: r.approved_count || 0,
      rejectedCount: r.rejected_count || 0,
      paidTotal: Math.round(parseFloat(r.paid_total || 0) * 100) / 100,
      paidThisMonth: Math.round(parseFloat(r.paid_month || 0) * 100) / 100
    };
  }
  const all = readJsonDb().social_posts || [];
  const aprovados = all.filter(p => p.status === 'approved');
  const soma = (arr) => arr.reduce((a, p) => a + parseFloat(p.reward || 0), 0);
  const doMes = aprovados.filter(p => new Date(p.reviewedAt || 0) >= new Date(inicioIso));
  return {
    pending: all.filter(p => p.status === 'pending').length,
    approvedCount: aprovados.length,
    rejectedCount: all.filter(p => p.status === 'rejected').length,
    paidTotal: Math.round(soma(aprovados) * 100) / 100,
    paidThisMonth: Math.round(soma(doMes) * 100) / 100
  };
}

async function getApprovedWithdrawalsTotal(userId) {
  const APROVADOS = ['approved', 'aprovado', 'completed', 'paid'];
  let txs;
  if (isPostgres) {
    const res = await pool.query(
      `SELECT amount, status FROM transactions WHERE user_id = $1 AND type = 'withdraw'`,
      [userId]
    );
    txs = res.rows;
  } else {
    txs = readJsonDb().transactions.filter(t => t.userId === userId && t.type === 'withdraw');
  }
  let total = 0;
  let count = 0;
  for (const t of (txs || [])) {
    if (!APROVADOS.includes(String(t.status || '').toLowerCase())) continue;
    const v = Math.abs(parseFloat(t.amount || 0));
    if (!Number.isFinite(v)) continue;
    total += v;
    count++;
  }
  return { total: Math.round(total * 100) / 100, count };
}

// Só as recargas confirmadas (leve, para o app consultar de tempos em tempos
// e avisar o Meta). Não traz o restante do extrato, que cresce muito.
async function getApprovedDeposits(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT id, amount, type, status, created_at FROM transactions
       WHERE user_id = $1 AND type = 'deposit' AND status = 'approved'
       ORDER BY created_at DESC LIMIT 200`,
      [userId]
    );
    return res.rows.map(r => ({ id: r.id, amount: parseFloat(r.amount || 0), type: r.type, status: r.status, createdAt: r.created_at }));
  }
  const db = readJsonDb();
  return (db.transactions || [])
    .filter(t => t.userId === userId && t.type === 'deposit' && t.status === 'approved')
    .slice(0, 200)
    .map(t => ({ id: t.id, amount: Math.abs(parseFloat(t.amount || 0)), type: 'deposit', status: 'approved', createdAt: t.createdAt }));
}

// Recargas aprovadas que AINDA NÃO foram reportadas para Meta/TikTok.
// A marcação vive no servidor (ad_reported_at) justamente para não depender de
// localStorage: se o storage estiver bloqueado (WebView do WhatsApp) ou for
// limpo, o evento não sai repetido a cada 30s.
async function getUnreportedDeposits(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT id, amount, type, status, created_at FROM transactions
       WHERE user_id = $1 AND type = 'deposit' AND status = 'approved' AND ad_reported_at IS NULL
       ORDER BY created_at DESC LIMIT 200`,
      [userId]
    );
    return res.rows.map(r => ({ id: r.id, amount: Math.abs(parseFloat(r.amount || 0)), type: 'deposit', status: 'approved', createdAt: r.created_at }));
  }
  const db = readJsonDb();
  return (db.transactions || [])
    .filter(t => t.userId === userId && t.type === 'deposit' && t.status === 'approved' && !t.adReportedAt)
    .slice(0, 200)
    .map(t => ({ id: t.id, amount: Math.abs(parseFloat(t.amount || 0)), type: 'deposit', status: 'approved', createdAt: t.createdAt }));
}

// Marca as recargas como já reportadas para as plataformas de anúncio.
async function markDepositsReported(ids) {
  const lista = (ids || []).map(String).filter(Boolean).slice(0, 200);
  if (!lista.length) return 0;
  const agora = new Date().toISOString();
  if (isPostgres) {
    const res = await pool.query(
      `UPDATE transactions SET ad_reported_at = $1 WHERE id = ANY($2::varchar[]) AND ad_reported_at IS NULL`,
      [agora, lista]
    );
    return (res.rowCount || 0);
  }
  const db = readJsonDb();
  let n = 0;
  for (const t of (db.transactions || [])) {
    if (!lista.includes(String(t.id))) continue;
    if (t.adReportedAt) continue;
    t.adReportedAt = agora;
    n++;
  }
  if (n) writeJsonDb(db);
  return n;
}

async function getAllTransactions() {
  if (isPostgres) {
    const res = await pool.query(`
      SELECT t.*, u.operator_name, u.phone 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `);
    return res.rows.map(row => ({
      ...mapTransaction(row),
      userName: row.operator_name || 'UsuÃ¡rio Desconhecido',
      userPhone: row.phone || 'N/A'
    }));
  }

  const db = readJsonDb();
  return db.transactions.map(t => {
    const user = db.users.find(u => u.id === t.userId);
    return {
      ...t,
      userName: user ? user.operatorName : 'UsuÃ¡rio Desconhecido',
      userPhone: user ? user.phone : 'N/A'
    };
  });
}

async function findTransactionById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM transactions WHERE id = $1', [id]);
    return mapTransaction(res.rows[0]);
  }
  const db = readJsonDb();
  return db.transactions.find(t => t.id === id) || null;
}

async function createTransaction(tx) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO transactions (id, user_id, type, amount, status, pix_key, pix_key_type, description, external_id, created_at, approved_at, rejected_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      tx.id,
      tx.userId,
      tx.type,
      tx.amount,
      tx.status || 'approved',
      tx.pixKey || null,
      tx.pixKeyType || null,
      tx.description || '',
      tx.externalId || null,
      tx.createdAt || new Date().toISOString(),
      tx.approvedAt || null,
      tx.rejectedAt || null
    ]);
    return tx;
  }

  const db = readJsonDb();
  db.transactions.unshift(tx);
  writeJsonDb(db);
  return tx;
}

async function updateTransaction(id, fields) {

  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }
    if (fields.approvedAt !== undefined) {
      setClauses.push(`approved_at = $${idx++}`);
      values.push(fields.approvedAt);
    }
    if (fields.rejectedAt !== undefined) {
      setClauses.push(`rejected_at = $${idx++}`);
      values.push(fields.rejectedAt);
    }
    if (fields.externalId !== undefined) {
      setClauses.push(`external_id = $${idx++}`);
      values.push(fields.externalId);
    }
    if (fields.adReportedAt !== undefined) {
      setClauses.push(`ad_reported_at = $${idx++}`);
      values.push(fields.adReportedAt);
    }

    if (setClauses.length === 0) return await findTransactionById(id);

    values.push(id);
    const query = `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapTransaction(res.rows[0]);
  }

  const db = readJsonDb();
  const tx = db.transactions.find(t => t.id === id);
  if (tx) {
    Object.assign(tx, fields);
    writeJsonDb(db);
  }
  return tx;
}

async function findTransactionByExternalId(externalId) {
  if (!externalId) return null;
  const key = String(externalId);
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM transactions WHERE external_id = $1 ORDER BY created_at DESC LIMIT 1', [key]);
    return mapTransaction(res.rows[0]);
  }
  const db = readJsonDb();
  const list = (db.transactions || []).filter(t => String(t.externalId || '') === key);
  return list.length ? list[list.length - 1] : null;
}

// Reserva atômica de saque (evita pagamento/estorno duplo em clique duplo).
// fromStatus: 'pending' (fluxo normal) ou 'processing' (saque que travou
// preso e precisa ser fechado na mão pelo admin).
async function claimWithdrawal(id, fromStatus) {
  if (!id) return null;
  const from = fromStatus || 'pending';
  if (isPostgres) {
    const res = await pool.query(
      "UPDATE transactions SET status = 'processing' WHERE id = $1 AND status = $2 AND type = 'withdraw' RETURNING *",
      [String(id), from]
    );
    return mapTransaction(res.rows[0]);
  }
  const db = readJsonDb();
  const tx = (db.transactions || []).find(t => String(t.id) === String(id));
  if (!tx || tx.type !== 'withdraw' || tx.status !== from) return null;
  tx.status = 'processing';
  writeJsonDb(db);
  return tx;
}

async function deleteTransaction(id) {
  if (!id) return false;
  if (isPostgres) {
    const res = await pool.query('DELETE FROM transactions WHERE id = $1', [String(id)]);
    return (res.rowCount || 0) > 0;
  }
  const db = readJsonDb();
  const before = (db.transactions || []).length;
  db.transactions = (db.transactions || []).filter(t => String(t.id) !== String(id));
  if (db.transactions.length < before) writeJsonDb(db);
  return db.transactions.length < before;
}

// --- STATS & METRICS ---
async function getGlobalMetrics() {
  if (isPostgres) {
    const [userRes, depRes, withRes, pendRes, contRes, custRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT COALESCE(SUM(amount), 0) as sum FROM transactions WHERE type = 'deposit' AND status = 'approved'"),
      pool.query("SELECT COALESCE(SUM(ABS(amount)), 0) as sum FROM transactions WHERE type = 'withdraw' AND status = 'approved'"),
      pool.query("SELECT COUNT(*) FROM transactions WHERE type = 'withdraw' AND status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM contracts WHERE status = 'Em corrida'"),
      pool.query('SELECT COALESCE(SUM(balance), 0) as sum FROM users')
    ]);

    return {
      totalUsers: parseInt(userRes.rows[0].count, 10),
      totalDeposits: parseFloat(depRes.rows[0].sum),
      totalWithdrawals: parseFloat(withRes.rows[0].sum),
      pendingWithdrawalsCount: parseInt(pendRes.rows[0].count, 10),
      activeContracts: parseInt(contRes.rows[0].count, 10),
      totalCustodyBalance: parseFloat(custRes.rows[0].sum)
    };
  }

  const db = readJsonDb();
  const totalUsers = db.users.length;
  const totalDeposits = db.transactions
    .filter(t => t.type === 'deposit' && t.status === 'approved')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalWithdrawals = db.transactions
    .filter(t => t.type === 'withdraw' && t.status === 'approved')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const pendingWithdrawalsCount = db.transactions
    .filter(t => t.type === 'withdraw' && t.status === 'pending').length;
  const activeContracts = db.contracts.filter(c => c.status === 'Em corrida').length;
  const totalCustodyBalance = db.users.reduce((acc, u) => acc + u.balance, 0);

  return {
    totalUsers,
    totalDeposits,
    totalWithdrawals,
    pendingWithdrawalsCount,
    activeContracts,
    totalCustodyBalance
  };
}

// ==========================================
// ANALYTICS & VISITOR TRACKING
// ==========================================
async function recordPageView({ path, ipHash, device, referrer }) {
  const clean = (v, max) => String(v || '').replace(/[<>"']/g, '').slice(0, max || 300);
  path = clean(path, 300);
  device = clean(device, 120) || 'desktop';
  referrer = clean(referrer, 300) || 'Direto';
  if (isPostgres) {
    await pool.query(`
      INSERT INTO page_views (path, ip_hash, device, referrer, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [path, ipHash, device || 'desktop', referrer || 'Direto']);
    return;
  }

  const db = readJsonDb();
  if (!db.pageViews) db.pageViews = [];
  db.pageViews.unshift({
    id: Date.now(),
    path,
    ip_hash: ipHash,
    device: device || 'desktop',
    referrer: referrer || 'Direto',
    created_at: new Date().toISOString()
  });
  if (db.pageViews.length > 500) db.pageViews.length = 500;
  writeJsonDb(db);
}

async function getAnalyticsMetrics() {
  if (isPostgres) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayUniq, totalUniq, todayPresell, todayApp, todayTotal, recent] = await Promise.all([
      pool.query('SELECT COUNT(DISTINCT ip_hash) as count FROM page_views WHERE created_at >= $1', [today.toISOString()]),
      pool.query('SELECT COUNT(DISTINCT ip_hash) as count FROM page_views'),
      pool.query("SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1 AND (path LIKE '%presell%' OR path LIKE '%apresentacao%' OR path LIKE '%start%' OR path LIKE '%como-funciona%')", [today.toISOString()]),
      pool.query("SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1 AND (path = '/' OR path LIKE '%login%' OR path LIKE '%index%')", [today.toISOString()]),
      pool.query('SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1', [today.toISOString()]),
      pool.query('SELECT path, device, referrer, created_at FROM page_views ORDER BY created_at DESC LIMIT 25')
    ]);

    return {
      todayUniqueVisitors: parseInt(todayUniq.rows[0].count, 10),
      totalUniqueVisitors: parseInt(totalUniq.rows[0].count, 10),
      todayPresellViews: parseInt(todayPresell.rows[0].count, 10),
      todayAppViews: parseInt(todayApp.rows[0].count, 10),
      todayTotalViews: parseInt(todayTotal.rows[0].count, 10),
      recentViews: recent.rows
    };
  }

  const db = readJsonDb();
  const pageViews = db.pageViews || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayViews = pageViews.filter(v => new Date(v.created_at) >= today);
    const todayUniqueVisitors = new Set(todayViews.map(v => v.ip_hash)).size;
  const totalUniqueVisitors = new Set(pageViews.map(v => v.ip_hash)).size;
  const todayPresellViews = todayViews.filter(v => (v.path || '').includes('presell')).length;
  const todayAppViews = todayViews.filter(v => v.path === '/' || (v.path || '').includes('login')).length;
  const todayTotalViews = todayViews.length;
  const recentViews = pageViews.slice(0, 25);

  return {
    todayUniqueVisitors,
    totalUniqueVisitors,
    todayPresellViews,
    todayAppViews,
    todayTotalViews,
    recentViews
  };
}

// ==========================================
// PROMO CODES (cupons bonus)
// ==========================================
function normPromoCode(v) {
  return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
}

async function createPromoCode({ code, amount, maxUses, expiresAt }) {
  code = normPromoCode(code);
  const numAmount = parseFloat(amount);
  const numMax = parseInt(maxUses, 10);
  if (!code || !(numAmount > 0) || !(numMax > 0)) throw new Error('Dados do cupom invalidos.');
  const exp = expiresAt ? new Date(expiresAt) : null;
  if (isPostgres) {
    const res = await pool.query(`
      INSERT INTO promo_codes (code, amount, max_uses, used_count, active, expires_at)
      VALUES ($1, $2, $3, 0, TRUE, $4)
      ON CONFLICT (code) DO NOTHING
      RETURNING *
    `, [code, numAmount, numMax, exp && !isNaN(exp) ? exp.toISOString() : null]);
    if (!res.rows[0]) throw new Error('Codigo ja existe.');
    return mapPromo(res.rows[0]);
  }
  const db = readJsonDb();
  if (!db.promoCodes) db.promoCodes = [];
  if (db.promoCodes.some(p => p.code === code)) throw new Error('Codigo ja existe.');
  const row = { code, amount: numAmount, max_uses: numMax, used_count: 0, active: true, expires_at: exp && !isNaN(exp) ? exp.toISOString() : null, created_at: new Date().toISOString() };
  db.promoCodes.unshift(row);
  writeJsonDb(db);
  return mapPromo(row);
}

function mapPromo(row) {
  if (!row) return null;
  return {
    code: row.code,
    amount: parseFloat(row.amount || 0),
    maxUses: parseInt(row.max_uses ?? 1, 10),
    usedCount: parseInt(row.used_count ?? 0, 10),
    active: row.active !== false,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at
  };
}

async function listPromoCodes() {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 200');
    return res.rows.map(mapPromo);
  }
  const db = readJsonDb();
  return (db.promoCodes || []).map(mapPromo);
}

async function findPromoCode(code) {
  code = normPromoCode(code);
  if (!code) return null;
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
    return mapPromo(res.rows[0]);
  }
  const db = readJsonDb();
  return mapPromo((db.promoCodes || []).find(p => p.code === code));
}

async function setPromoActive(code, active) {
  code = normPromoCode(code);
  if (isPostgres) {
    await pool.query('UPDATE promo_codes SET active = $1 WHERE code = $2', [!!active, code]);
  } else {
    const db = readJsonDb();
    const row = (db.promoCodes || []).find(p => p.code === code);
    if (row) { row.active = !!active; writeJsonDb(db); }
  }
  return findPromoCode(code);
}

async function deletePromoCode(code) {
  code = normPromoCode(code);
  if (!code) return false;
  if (isPostgres) {
    const res = await pool.query('DELETE FROM promo_codes WHERE code = $1', [code]);
    return (res.rowCount || 0) > 0;
  }
  const db = readJsonDb();
  const before = (db.promoCodes || []).length;
  db.promoCodes = (db.promoCodes || []).filter(p => p.code !== code);
  if (Array.isArray(db.promoRedemptions)) db.promoRedemptions = db.promoRedemptions.filter(r => r.code !== code);
  writeJsonDb(db);
  return (db.promoCodes || []).length < before;
}

async function savePixCharge({ provider, identifier, userId, amount }) {
  if (!identifier || !userId) return null;
  const row = { identifier: String(identifier), provider: provider || '', userId: String(userId), amount: parseFloat(amount) || 0, status: 'pending', created_at: new Date().toISOString() };
  if (isPostgres) {
    await pool.query(`
      INSERT INTO pix_charges (identifier, provider, user_id, amount, status)
      VALUES ($1, $2, $3, $4, 'pending')
      ON CONFLICT (identifier) DO NOTHING
    `, [row.identifier, row.provider, row.userId, row.amount]);
    return row;
  }
  const db = readJsonDb();
  if (!db.pixCharges) db.pixCharges = [];
  if (!db.pixCharges.some(r => r.identifier === row.identifier)) {
    db.pixCharges.unshift(row);
    if (db.pixCharges.length > 500) db.pixCharges.length = 500;
    writeJsonDb(db);
  }
  return row;
}

async function findPixCharge(identifier) {
  if (!identifier) return null;
  const key = String(identifier);
  if (isPostgres) {
    const res = await pool.query('SELECT identifier, provider, user_id AS "userId", amount, status FROM pix_charges WHERE identifier = $1', [key]);
    return res.rows[0] || null;
  }
  const db = readJsonDb();
  return (db.pixCharges || []).find(r => r.identifier === key) || null;
}

async function markPixChargeUsed(identifier, status) {
  if (!identifier) return;
  const key = String(identifier);
  if (isPostgres) {
    await pool.query('UPDATE pix_charges SET status = $1 WHERE identifier = $2', [status || 'used', key]);
    return;
  }
  const db = readJsonDb();
  const row = (db.pixCharges || []).find(r => r.identifier === key);
  if (row) { row.status = status || 'used'; writeJsonDb(db); }
}

// Pix gerados (QR criado) x pagos: base da taxa de conversão no admin
async function getPixChargeStats() {
  if (isPostgres) {
    const res = await pool.query(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(amount), 0) AS amount,
             COUNT(*) FILTER (WHERE status = 'used') AS paid,
             COALESCE(SUM(amount) FILTER (WHERE status = 'used'), 0) AS paid_amount
      FROM pix_charges
    `);
    const r = res.rows[0] || {};
    return {
      generatedCount: parseInt(r.total || 0, 10),
      generatedAmount: parseFloat(r.amount || 0),
      paidCount: parseInt(r.paid || 0, 10),
      paidAmount: parseFloat(r.paid_amount || 0)
    };
  }
  const db = readJsonDb();
  const list = db.pixCharges || [];
  const paid = list.filter(r => r.status === 'used');
  return {
    generatedCount: list.length,
    generatedAmount: list.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0),
    paidCount: paid.length,
    paidAmount: paid.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0)
  };
}

async function sendSupportMessage(userId, sender, text) {
  text = String(text || '').replace(/[<>"']/g, '').trim().slice(0, 1000);
  if (!userId || !text) throw new Error('Mensagem invalida.');
  sender = sender === 'admin' ? 'admin' : 'user';
  const thread = await ensureOpenSupportThread(userId);
  const threadId = thread ? thread.id : null;
  if (isPostgres) {
    const res = await pool.query(`
      INSERT INTO support_messages (user_id, sender, text, is_read, thread_id)
      VALUES ($1, $2, $3, FALSE, $4)
      RETURNING id, user_id AS "userId", sender, text, is_read AS "isRead", created_at AS "createdAt", thread_id AS "threadId"
    `, [userId, sender, text, threadId]);
    return res.rows[0];
  }
  const db = readJsonDb();
  if (!db.supportMessages) db.supportMessages = [];
  const row = { id: Date.now(), userId, sender, text, isRead: false, threadId, created_at: new Date().toISOString() };
  db.supportMessages.push(row);
  if (db.supportMessages.length > 2000) db.supportMessages = db.supportMessages.slice(-2000);
  writeJsonDb(db);
  return { id: row.id, userId, sender, text, isRead: false, threadId, createdAt: row.created_at };
}

function mapSupportThread(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    status: row.status,
    createdAt: row.created_at || row.createdAt,
    closedAt: row.closed_at || row.closedAt || null
  };
}

async function getOpenSupportThread(userId) {
  if (!userId) return null;
  if (isPostgres) {
    const res = await pool.query(
      "SELECT * FROM support_threads WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    return mapSupportThread(res.rows[0]);
  }
  const db = readJsonDb();
  const list = (db.supportThreads || []).filter(t => (t.userId === userId || t.user_id === userId) && t.status === 'open');
  if (!list.length) return null;
  const last = list[list.length - 1];
  return { id: last.id, userId, status: 'open', createdAt: last.created_at, closedAt: null };
}

async function ensureOpenSupportThread(userId) {
  const open = await getOpenSupportThread(userId);
  if (open) return open;
  if (isPostgres) {
    const res = await pool.query(
      "INSERT INTO support_threads (user_id, status) VALUES ($1, 'open') RETURNING *",
      [userId]
    );
    return mapSupportThread(res.rows[0]);
  }
  const db = readJsonDb();
  if (!db.supportThreads) db.supportThreads = [];
  const maxId = db.supportThreads.reduce((a, t) => Math.max(a, parseInt(t.id, 10) || 0), 0);
  const row = { id: maxId + 1, userId, status: 'open', created_at: new Date().toISOString(), closed_at: null };
  db.supportThreads.push(row);
  writeJsonDb(db);
  return { id: row.id, userId, status: 'open', createdAt: row.created_at, closedAt: null };
}

async function closeSupportThread(userId) {
  if (!userId) return null;
  if (isPostgres) {
    const res = await pool.query(
      "UPDATE support_threads SET status = 'closed', closed_at = NOW() WHERE user_id = $1 AND status = 'open' RETURNING *",
      [userId]
    );
    const closed = mapSupportThread(res.rows[0]);
    if (closed) {
      await pool.query('UPDATE support_messages SET is_read = TRUE WHERE user_id = $1', [userId]);
    }
    return closed;
  }
  const db = readJsonDb();
  const open = (db.supportThreads || []).filter(t => (t.userId === userId || t.user_id === userId) && t.status === 'open');
  if (!open.length) return null;
  let dirty = false;
  for (const t of open) { t.status = 'closed'; t.closed_at = new Date().toISOString(); dirty = true; }
  for (const m of (db.supportMessages || [])) {
    if ((m.userId === userId || m.user_id === userId) && !m.isRead) { m.isRead = true; dirty = true; }
  }
  if (dirty) writeJsonDb(db);
  const last = open[open.length - 1];
  return { id: last.id, userId, status: 'closed', createdAt: last.created_at, closedAt: last.closed_at };
}

async function getLastClosedSupportThread(userId) {
  if (!userId) return null;
  if (isPostgres) {
    const res = await pool.query(
      "SELECT * FROM support_threads WHERE user_id = $1 AND status = 'closed' ORDER BY closed_at DESC LIMIT 1",
      [userId]
    );
    return mapSupportThread(res.rows[0]);
  }
  const db = readJsonDb();
  const list = (db.supportThreads || []).filter(t => (t.userId === userId || t.user_id === userId) && t.status === 'closed');
  if (!list.length) return null;
  const last = list[list.length - 1];
  return { id: last.id, userId, status: 'closed', createdAt: last.created_at, closedAt: last.closed_at };
}

async function getSupportMessages(userId, limit) {
  const n = Math.max(1, Math.min(parseInt(limit, 10) || 100, 200));
  if (isPostgres) {
    const res = await pool.query(
      'SELECT id, user_id AS "userId", sender, text, is_read AS "isRead", created_at AS "createdAt" FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2',
      [userId, n]
    );
    return res.rows;
  }
  const db = readJsonDb();
  return (db.supportMessages || []).filter(m => m.userId === userId || m.user_id === userId).slice(-n).map(m => ({
    id: m.id, userId: m.userId || m.user_id, sender: m.sender, text: m.text,
    isRead: !!m.isRead, createdAt: m.created_at
  }));
}

async function getSupportThreads() {
  if (isPostgres) {
    const res = await pool.query(`
      SELECT m.user_id AS "userId", MAX(m.created_at) AS "lastAt",
        COUNT(*) FILTER (WHERE m.sender = 'user' AND m.is_read = FALSE) AS "unread",
        MAX(u.operator_name) AS "userName", MAX(u.phone) AS "phone"
      FROM support_messages m
      LEFT JOIN users u ON u.id = m.user_id
      GROUP BY m.user_id
      ORDER BY MAX(m.created_at) DESC
      LIMIT 200
    `);
    return res.rows.map(r => ({ userId: r.userId, lastAt: r.lastAt, unread: parseInt(r.unread, 10) || 0, userName: r.userName, phone: r.phone }));
  }
  const db = readJsonDb();
  const map = {};
  for (const m of (db.supportMessages || [])) {
    const uid = m.userId || m.user_id;
    if (!uid) continue;
    if (!map[uid]) map[uid] = { userId: uid, lastAt: m.created_at, unread: 0, userName: '', phone: '' };
    if ((m.created_at || '') > (map[uid].lastAt || '')) map[uid].lastAt = m.created_at;
    if (m.sender === 'user' && !m.isRead) map[uid].unread++;
  }
  const users = db.users || [];
  const out = Object.values(map).map(t => {
    const u = users.find(x => x.id === t.userId) || {};
    t.userName = u.operatorName || u.operator_name || '';
    t.phone = u.phone || '';
    return t;
  });
  out.sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  return out.slice(0, 200);
}

async function markSupportRead(userId) {
  if (isPostgres) {
    await pool.query("UPDATE support_messages SET is_read = TRUE WHERE user_id = $1 AND sender = 'user'", [userId]);
    return;
  }
  const db = readJsonDb();
  let dirty = false;
  for (const m of (db.supportMessages || [])) {
    if ((m.userId === userId || m.user_id === userId) && m.sender === 'user' && !m.isRead) {
      m.isRead = true; dirty = true;
    }
  }
  if (dirty) writeJsonDb(db);
}

// Não-lidas do ADMIN para o usuário (respostas que ele ainda não viu)
async function countUnreadSupport(userId) {
  if (isPostgres) {
    const res = await pool.query(
      "SELECT COUNT(*) FROM support_messages WHERE user_id = $1 AND sender = 'admin' AND is_read = FALSE",
      [userId]
    );
    return parseInt(res.rows[0].count || 0, 10);
  }
  const db = readJsonDb();
  return (db.supportMessages || []).filter(m =>
    (m.userId === userId || m.user_id === userId) && m.sender === 'admin' && !m.isRead
  ).length;
}

// Marca respostas do admin como lidas (quando o usuário abre o chat)
async function markSupportRepliesRead(userId) {
  if (isPostgres) {
    await pool.query("UPDATE support_messages SET is_read = TRUE WHERE user_id = $1 AND sender = 'admin'", [userId]);
    return;
  }
  const db = readJsonDb();
  let dirty = false;
  for (const m of (db.supportMessages || [])) {
    if ((m.userId === userId || m.user_id === userId) && m.sender === 'admin' && !m.isRead) {
      m.isRead = true; dirty = true;
    }
  }
  if (dirty) writeJsonDb(db);
}

async function hasUserRedeemed(code, userId) {
  code = normPromoCode(code);
  if (isPostgres) {
    const res = await pool.query('SELECT 1 FROM promo_redemptions WHERE code = $1 AND user_id = $2', [code, userId]);
    return res.rows.length > 0;
  }
  const db = readJsonDb();
  return (db.promoRedemptions || []).some(r => r.code === code && (r.userId === userId || r.user_id === userId));
}

async function redeemPromo(code, userId) {
  code = normPromoCode(code);
  const promo = await findPromoCode(code);
  if (!promo) return { ok: false, error: 'Codigo invalido.' };
  if (!promo.active) return { ok: false, error: 'Codigo desativado.' };
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return { ok: false, error: 'Codigo expirado.' };
  if (promo.usedCount >= promo.maxUses) return { ok: false, error: 'Codigo esgotado.' };
  if (await hasUserRedeemed(code, userId)) return { ok: false, error: 'Voce ja resgatou este codigo.' };
  if (isPostgres) {
    try {
      await pool.query('INSERT INTO promo_redemptions (code, user_id) VALUES ($1, $2)', [code, userId]);
      const upd = await pool.query(
        'UPDATE promo_codes SET used_count = used_count + 1 WHERE code = $1 AND used_count < max_uses RETURNING *',
        [code]
      );
      if (!upd.rows[0]) {
        await pool.query('DELETE FROM promo_redemptions WHERE code = $1 AND user_id = $2', [code, userId]);
        return { ok: false, error: 'Codigo esgotado.' };
      }
      return { ok: true, promo: mapPromo(upd.rows[0]) };
    } catch (e) {
      if (String(e.code) === '23505') return { ok: false, error: 'Voce ja resgatou este codigo.' };
      throw e;
    }
  }
  const db = readJsonDb();
  if (!db.promoRedemptions) db.promoRedemptions = [];
  if (db.promoRedemptions.some(r => r.code === code && (r.userId === userId || r.user_id === userId))) {
    return { ok: false, error: 'Voce ja resgatou este codigo.' };
  }
  const row = (db.promoCodes || []).find(p => p.code === code);
  if (!row || row.used_count >= row.max_uses) return { ok: false, error: 'Codigo esgotado.' };
  row.used_count = (row.used_count || 0) + 1;
  db.promoRedemptions.push({ code, userId, created_at: new Date().toISOString() });
  writeJsonDb(db);
  return { ok: true, promo: mapPromo(row) };
}

// ==========================================
// WEBHOOK LOGS & AUDIT
// ==========================================
async function recordWebhookLog({ provider, eventType, amount, customerPhone, customerName, customerEmail, matchedUserId, status, note, rawPayload }) {
  if (isPostgres) {
    try {
      await pool.query(`
        INSERT INTO webhook_logs (provider, event_type, amount, customer_phone, customer_name, customer_email, matched_user_id, status, note, raw_payload, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        provider || 'cartpanda',
        eventType || 'order.paid',
        amount || 0,
        customerPhone || null,
        customerName || null,
        customerEmail || null,
        matchedUserId || null,
        status || 'received',
        note || '',
        JSON.stringify(rawPayload || {})
      ]);
    } catch (err) {
      console.error('[DATABASE ERROR /recordWebhookLog]:', err.message);
    }
    return;
  }

  const db = readJsonDb();
  if (!db.webhookLogs) db.webhookLogs = [];
  db.webhookLogs.unshift({
    id: Date.now(),
    provider: provider || 'cartpanda',
    eventType: eventType || 'order.paid',
    amount: amount || 0,
    customerPhone,
    customerName,
    customerEmail,
    matchedUserId,
    status,
    note,
    rawPayload,
    createdAt: new Date().toISOString()
  });
  if (db.webhookLogs.length > 300) db.webhookLogs.length = 300;
  writeJsonDb(db);
}

async function getWebhookLogs(limit = 50) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return res.rows;
  }
  const db = readJsonDb();
  return (db.webhookLogs || []).slice(0, limit);
}

async function findWebhookLogById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM webhook_logs WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
  const db = readJsonDb();
  return (db.webhookLogs || []).find(l => String(l.id) === String(id)) || null;
}

async function updateWebhookLog(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;
    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }
    if (fields.note !== undefined) {
      setClauses.push(`note = $${idx++}`);
      values.push(fields.note);
    }
    if (fields.matchedUserId !== undefined) {
      setClauses.push(`matched_user_id = $${idx++}`);
      values.push(fields.matchedUserId);
    }
    if (setClauses.length === 0) return null;
    values.push(id);
    const res = await pool.query(`UPDATE webhook_logs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return res.rows[0] || null;
  }
  const db = readJsonDb();
  const item = (db.webhookLogs || []).find(l => String(l.id) === String(id));
  if (item) {
    Object.assign(item, fields);
    writeJsonDb(db);
    return item;
  }
  return null;
}

async function getSystemSettings() {
  const defaultSettings = {
    nexusCrmUrl: process.env.APP_URL ? (process.env.APP_URL + '/crm') : '',
    whatsappNumber: '',
    metaPixelId: '',
    tiktokPixelId: '',
    gatewayOrder: 'misticpay,syncpay,asaas,cartpanda',
    gatewayDisabled: '',
    minDeposit: 20,
    minWithdraw: 15,
    withdrawFee: 10,
    signupBonus: 5,
    // Fase 2 — limites nativos (todos configuráveis no admin)
    maxDepositTx: 5000,
    maxDepositDay: 10000,
    maxWithdrawTx: 2000,
    maxWithdrawDay: 2000,
    newAccountGraceH: 24,
    newAccountCap7d: 500,
    globalDailyWithdrawCap: 20000,
    payoutsPaused: '0',
    depositsPaused: '0',
    // Marca de que o contador de deposito ja foi zerado (regra de saque "a
    // partir de agora"). Precisa existir aqui senao getSystemSettings() nao
    // devolve a chave e o admin acaba deixando zerar duas vezes.
    depositCounterResetAt: ''
  };

  if (isPostgres) {
    try {
      const res = await pool.query('SELECT key, value FROM system_settings');
      const settings = { ...defaultSettings };
      res.rows.forEach(r => {
        if (r.key === 'nexus_crm_url') settings.nexusCrmUrl = r.value;
        if (r.key === 'whatsapp_number') settings.whatsappNumber = r.value;
        if (r.key === 'meta_pixel_id') settings.metaPixelId = r.value;
        if (r.key === 'tiktok_pixel_id') settings.tiktokPixelId = r.value;
        if (r.key === 'gateway_order') settings.gatewayOrder = r.value;
        if (r.key === 'gateway_disabled') settings.gatewayDisabled = r.value;
        if (r.key === 'min_deposit') settings.minDeposit = parseFloat(r.value);
        if (r.key === 'min_withdraw') settings.minWithdraw = parseFloat(r.value);
        if (r.key === 'withdraw_fee') settings.withdrawFee = parseFloat(r.value);
        if (r.key === 'signup_bonus') settings.signupBonus = parseFloat(r.value);
        if (r.key === 'max_deposit_tx') settings.maxDepositTx = parseFloat(r.value);
        if (r.key === 'max_deposit_day') settings.maxDepositDay = parseFloat(r.value);
        if (r.key === 'max_withdraw_tx') settings.maxWithdrawTx = parseFloat(r.value);
        if (r.key === 'max_withdraw_day') settings.maxWithdrawDay = parseFloat(r.value);
        if (r.key === 'new_account_grace_h') settings.newAccountGraceH = parseFloat(r.value);
        if (r.key === 'new_account_cap_7d') settings.newAccountCap7d = parseFloat(r.value);
        if (r.key === 'global_daily_withdraw_cap') settings.globalDailyWithdrawCap = parseFloat(r.value);
        if (r.key === 'payouts_paused') settings.payoutsPaused = r.value;
        if (r.key === 'deposits_paused') settings.depositsPaused = r.value;
      if (r.key === 'deposit_counter_reset_at') settings.depositCounterResetAt = r.value;
      });
      return settings;
    } catch (e) {
      return defaultSettings;
    }
  }

const db = readJsonDb();
const s = db.systemSettings || {};
return {
  ...defaultSettings,
  nexusCrmUrl: s.nexus_crm_url ?? defaultSettings.nexusCrmUrl,
  whatsappNumber: s.whatsapp_number ?? defaultSettings.whatsappNumber,
  metaPixelId: s.meta_pixel_id ?? defaultSettings.metaPixelId,
  tiktokPixelId: s.tiktok_pixel_id ?? defaultSettings.tiktokPixelId,
  gatewayOrder: s.gateway_order ?? defaultSettings.gatewayOrder,
  gatewayDisabled: s.gateway_disabled ?? defaultSettings.gatewayDisabled,
  minDeposit: s.min_deposit !== undefined && s.min_deposit !== null ? parseFloat(s.min_deposit) : defaultSettings.minDeposit,
  minWithdraw: s.min_withdraw !== undefined && s.min_withdraw !== null ? parseFloat(s.min_withdraw) : defaultSettings.minWithdraw,
  withdrawFee: s.withdraw_fee !== undefined && s.withdraw_fee !== null ? parseFloat(s.withdraw_fee) : defaultSettings.withdrawFee,
  signupBonus: s.signup_bonus !== undefined && s.signup_bonus !== null ? parseFloat(s.signup_bonus) : defaultSettings.signupBonus,
  maxDepositTx: s.max_deposit_tx !== undefined && s.max_deposit_tx !== null ? parseFloat(s.max_deposit_tx) : defaultSettings.maxDepositTx,
  maxDepositDay: s.max_deposit_day !== undefined && s.max_deposit_day !== null ? parseFloat(s.max_deposit_day) : defaultSettings.maxDepositDay,
  maxWithdrawTx: s.max_withdraw_tx !== undefined && s.max_withdraw_tx !== null ? parseFloat(s.max_withdraw_tx) : defaultSettings.maxWithdrawTx,
  maxWithdrawDay: s.max_withdraw_day !== undefined && s.max_withdraw_day !== null ? parseFloat(s.max_withdraw_day) : defaultSettings.maxWithdrawDay,
  newAccountGraceH: s.new_account_grace_h !== undefined && s.new_account_grace_h !== null ? parseFloat(s.new_account_grace_h) : defaultSettings.newAccountGraceH,
  newAccountCap7d: s.new_account_cap_7d !== undefined && s.new_account_cap_7d !== null ? parseFloat(s.new_account_cap_7d) : defaultSettings.newAccountCap7d,
  globalDailyWithdrawCap: s.global_daily_withdraw_cap !== undefined && s.global_daily_withdraw_cap !== null ? parseFloat(s.global_daily_withdraw_cap) : defaultSettings.globalDailyWithdrawCap,
  payoutsPaused: s.payouts_paused ?? defaultSettings.payoutsPaused,
  depositsPaused: s.deposits_paused ?? defaultSettings.depositsPaused,
      depositCounterResetAt: s.deposit_counter_reset_at ?? defaultSettings.depositCounterResetAt
};
}

// Ordem de tentativa das gateways (configurável no admin; nomes válidos)
const KNOWN_GATEWAYS = ['misticpay', 'syncpay', 'asaas', 'cartpanda'];
function normalizeGatewayOrder(value) {
  const asked = String(value || '').split(',').map(s => s.trim().toLowerCase()).filter(s => KNOWN_GATEWAYS.includes(s));
  for (const g of KNOWN_GATEWAYS) if (!asked.includes(g)) asked.push(g);
  return asked;
}
async function getGatewayOrder() {
  try {
    const s = await getSystemSettings();
    const disabled = normalizeGatewayDisabled(s.gatewayDisabled);
    return normalizeGatewayOrder(s.gatewayOrder).filter(g => !disabled.includes(g));
  } catch (e) {
    return [...KNOWN_GATEWAYS];
  }
}
function normalizeGatewayDisabled(value) {
  return String(value || '').split(',').map(s => s.trim().toLowerCase()).filter(s => KNOWN_GATEWAYS.includes(s));
}
async function getGatewayDisabled() {
  try {
    const s = await getSystemSettings();
    return normalizeGatewayDisabled(s.gatewayDisabled);
  } catch (e) {
    return [];
  }
}

// Limites de valores (configuráveis no admin; sempre saneados via services/limits)
async function getMoneyLimits() {
  try {
    const s = await getSystemSettings();
    let minDeposit = parseFloat(s.minDeposit);
    let minWithdraw = parseFloat(s.minWithdraw);
    let withdrawFee = parseFloat(s.withdrawFee);
    let signupBonus = parseFloat(s.signupBonus);
    if (!isFinite(minDeposit) || minDeposit < 1) minDeposit = 20;
    if (!isFinite(minWithdraw) || minWithdraw < 1) minWithdraw = 15;
    if (!isFinite(withdrawFee) || withdrawFee < 0 || withdrawFee > 50) withdrawFee = 10;
    if (!isFinite(signupBonus) || signupBonus < 0 || signupBonus > 1000) signupBonus = 5;
    const { parseLimitSettings } = require('./services/limits');
    return { minDeposit, minWithdraw, withdrawFee, signupBonus, ...parseLimitSettings(s) };
  } catch (e) {
    const { parseLimitSettings } = require('./services/limits');
    return { minDeposit: 20, minWithdraw: 15, withdrawFee: 10, signupBonus: 5, ...parseLimitSettings({}) };
  }
}

async function updateSystemSetting(key, value) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [key, value]);
    return { key, value };
  }

  const db = readJsonDb();
  if (!db.systemSettings) db.systemSettings = {};
  db.systemSettings[key] = value;
  writeJsonDb(db);
  return { key, value };
}

module.exports = {
  isPostgres,
  initDb,
  // Users
  findUserById,
  findUserByPhone,
  findUserByInviteCode,
createUser,
updateUser,
deleteUser,
getAllUsers,
countUsersByIpSince,
  // Products
  getAllProducts,
  findProductById,
  updateProduct,
  // Contracts
  getContractsByUserId,
  getAllActiveContracts,
  createContract,
  updateContract,
  deleteContract,
  // Transactions
  getTransactionsByUserId,
  getApprovedWithdrawalsTotal,
  newSocialPostId,
  createSocialPost,
  getSocialPostById,
  getUserSocialPosts,
  getPendingSocialPosts,
  markSocialCredited,
  getUserEarnedTotal,
  countPendingSocialByUser,
  countApprovedSocialByUser,
  approveSocialPost,
  rejectSocialPost,
  getSocialStats,
  getUnreportedDeposits,
  markDepositsReported,
  getApprovedDeposits,
  getAllTransactions,
  findTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  findTransactionByExternalId,
  claimWithdrawal,
  // Stats & Analytics
  getGlobalMetrics,
  recordPageView,
  getAnalyticsMetrics,
// Webhooks
recordWebhookLog,
getWebhookLogs,
findWebhookLogById,
updateWebhookLog,
// Promo Codes
normPromoCode,
createPromoCode,
listPromoCodes,
findPromoCode,
setPromoActive,
deletePromoCode,
savePixCharge,
findPixCharge,
markPixChargeUsed,
getPixChargeStats,
  sendSupportMessage,
  getSupportMessages,
  getSupportThreads,
  getOpenSupportThread,
  ensureOpenSupportThread,
  closeSupportThread,
  getLastClosedSupportThread,
  markSupportRead,
  countUnreadSupport,
  markSupportRepliesRead,
hasUserRedeemed,
redeemPromo,
  // System Settings
  getSystemSettings,
  updateSystemSetting,
  normalizeGatewayOrder,
  getGatewayOrder,
  normalizeGatewayDisabled,
  getGatewayDisabled,
  getMoneyLimits,
  newUserId,
  newInviteCode,
  newContractId,
};
