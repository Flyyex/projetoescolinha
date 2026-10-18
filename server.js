require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDb, recordPageView } = require('./database');
const { initTelegramBot } = require('./services/telegramBot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
});

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Atrás do proxy do Render: req.ip precisa ser o IP real do visitante,
// senão o rate-limit conta todo mundo como 1 IP só e trava o cadastro.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(require('cookie-parser')());

// Cabecalhos de seguranca (sem CSP/COEP para nao quebrar scripts e fontes inline do app)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.disable('x-powered-by');

// Anti-forca-bruta nas rotas de autenticacao (plano free: MemoryStore, single-instance).
// IP folgado para campanha/NAT + por-conta estrito para segurar brute-force real.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' }
});

const normalizePhoneKey = (phone) => String(phone || '').replace(/\D/g, '').slice(-13) || 'sem-telefone';

const loginPhoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${normalizePhoneKey(req.body && req.body.phone)}`,
  message: { error: 'Muitas tentativas para esta conta. Aguarde 15 minutos.' }
});

app.use(['/api/auth/login', '/api/admin/auth/verify'], loginIpLimiter);
app.use('/api/auth/login', loginPhoneLimiter);

// Cadastro: 60/h por IP aguenta centenas/h distribuidas + Wi-Fi compartilhado.
// Anti-farming de bonus continua no banco (telefone duplicado barrado em routes/auth.js).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitos cadastros a partir deste IP. Tente novamente em 1 hora.' }
});
app.use('/api/auth/register', registerLimiter);

// Middleware de Rastreamento de Visitantes Reais (Analytics & Presell Najaf)
app.use((req, res, next) => {
  const p = (req.path || '/').toLowerCase();
  const isStaticAsset = /\.(jpg|jpeg|png|gif|ico|svg|css|js|map|json|woff|woff2|ttf|txt)$/i.test(p);
  const isApi = p.startsWith('/api/') || p.startsWith('/webhook');

  if (!isStaticAsset && !isApi && req.method === 'GET') {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isSearchBot = /googlebot|bingbot|yandex|duckduckbot/i.test(userAgent);

    if (!isSearchBot) {
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress) || '127.0.0.1';
      const ipHash = crypto.createHash('sha256').update(clientIp + '_truckauto_salt').digest('hex').substring(0, 16);
      const isMobile = /mobile|iphone|android|ipad|phone/i.test(userAgent);
      const device = isMobile ? '📱 Mobile' : '💻 Desktop';
      
      let refText = 'Direto';
      if (req.query && req.query.utm_source) {
        refText = `UTM: ${req.query.utm_source}` + (req.query.utm_campaign ? ` (${req.query.utm_campaign})` : '');
      } else if (req.headers['referer']) {
        try {
          refText = `Ref: ${new URL(req.headers['referer']).hostname}`;
        } catch (e) {
          refText = 'Referrer Externo';
        }
      }

      let cleanPath = req.path;
      if (cleanPath === '' || cleanPath === '/') cleanPath = '/presell.html';

      recordPageView({
        path: cleanPath,
        ipHash: ipHash,
        device: device,
        referrer: String(refText).substring(0, 255)
      }).catch(err => console.error('[ANALYTICS ERROR]:', err.message));
    }
  }

  next();
});

// URLs limpas: redireciona legado *.html para rotas sem extensao (antes do static,
// senao o express.static serve o arquivo direto e o .html aparece na URL)
const legacyHtml = {
  '/login.html': '/login',
  '/index.html': '/app',
  '/presell.html': '/',
  '/admin.html': '/admin',
  '/termos.html': '/termos',
  '/privacidade.html': '/privacidade'
};
app.use((req, res, next) => {
  const target = legacyHtml[req.path];
  if (target) return res.redirect(301, target + (req.url.slice(req.path.length) || ''));
  next();
});

// Servir arquivos estáticos do diretório public
const publicDir = path.join(__dirname, 'public');

// Arquivos .html/.js/.json passam por aqui para trocar os tokens {{SITE_*}} pelos
// dados de config/site.json. O token fica no git e o valor so existe em memoria,
// entao nenhum contato/CNPJ vai parar no repositorio por engano.
const siteConfig = require('./services/siteConfig');
const arquivoCache = new Map();

function lerComTokens(alvo) {
  const stat = fs.statSync(alvo);
  let entrada = arquivoCache.get(alvo);
  if (!entrada || entrada.mtime !== stat.mtimeMs) {
    const bruto = fs.readFileSync(alvo, 'utf8');
    entrada = {
      mtime: stat.mtimeMs,
      lastModified: stat.mtime.toUTCString(),
      corpo: bruto.includes('{{SITE_') ? siteConfig.substituir(bruto) : bruto,
    };
    arquivoCache.set(alvo, entrada);
  }
  return entrada;
}

// Sem Cache-Control o navegador aplica cache heuristico e serve o HTML antigo
// sem nem revalidar: foi assim que os tokens trocados no config/site.json
// continuaram aparecendo na tela depois do deploy.
// no-cache = sempre revalida (304 barato quando nao mudou). Last-Modified faz a
// revalidacao funcionar de verdade.
function responderComCache(req, res, entrada, ext) {
  res.set('Cache-Control', 'no-cache');
  res.set('Last-Modified', entrada.lastModified);
  res.type(ext);
  res.send(entrada.corpo);
}

// Envia um HTML do public/ ja com os tokens substituidos.
// Rotas como /presell e /login nao tem extensao, entao nao passam pelo
// middleware de arquivos estaticos e precisavam ser tratadas por aqui.
function enviarHtml(req, res, relPath) {
  const alvo = path.join(publicDir, relPath);
  if (!alvo.startsWith(publicDir + path.sep)) return res.status(404).send('Not found');
  try {
    responderComCache(req, res, lerComTokens(alvo), '.html');
  } catch {
    res.status(404).send('Not found');
  }
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  let rel;
  try { rel = decodeURIComponent(req.path); } catch { return next(); }
  if (rel.endsWith('/') || !/\.(html|js|json)$/i.test(rel)) return next();

  const alvo = path.join(publicDir, rel);
  // nao deixa escapar do publicDir via ../
  if (!alvo.startsWith(publicDir + path.sep)) return next();

  try {
    if (!fs.statSync(alvo).isFile()) return next();
    responderComCache(req, res, lerComTokens(alvo), path.extname(alvo));
  } catch {
    next();
  }
});

// A raiz precisa ser resolvida ANTES do express.static: o express.static tem a
// opcao "index" ligada por padrao e servia public/index.html cru, sem passar pela
// substituicao de tokens (era por isso que o dashboard vazava {{SITE_EMAIL}}
// depois do login, que redireciona para "./").
app.get('/', (req, res) => enviarHtml(req, res, 'index.html'));

app.use(express.static(publicDir));

// Servir Nexus CRM em /crm
const crmDir = path.join(publicDir, 'crm');
app.use('/crm', express.static(crmDir));

// Rotas da API Backend TruckAuto
const walletRouter = require('./routes/wallet');
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', walletRouter);
app.use('/api/fleet', require('./routes/fleet'));
app.use('/api/team', require('./routes/team'));
app.use('/api/social', require('./routes/social')); // Programa Social (R$ 1 por video)
app.use('/api/admin', require('./routes/admin'));
app.use('/api/support', require('./routes/support')); // Chat de suporte in-app

// Health check precisa vir ANTES do router do CRM (abaixo): crm.js aplica
// sessao em todo /api/* e responderia 401 antes deste rota chegar.
// Render usa este endpoint para saber que o servico subiu, e o watchdog
// anti-sleep faz self-ping nele.
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'TRUCKAUTO Cloud API', timestamp: new Date().toISOString() });
});

// Webhook Aliases (Garante que qualquer variação de URL cadastrada no provedor funcione)
app.use(['/webhook/cartpanda', '/api/webhook/cartpanda', '/cartpanda/webhook'], (req, res, next) => {
  req.url = '/webhook/cartpanda';
  walletRouter(req, res, next);
});
app.use(['/webhook/mistic', '/api/webhook/mistic', '/mistic/webhook'], (req, res, next) => {
  req.url = '/webhook/mistic';
  walletRouter(req, res, next);
});

// Rotas da API Backend Nexus CRM & Webhooks Diretos
const crmRouter = require('./routes/crm')(io);
app.all(['/webhook/evolution', '/evolution/webhook', '/api/webhook/evolution'], (req, res, next) => {
  req.url = '/webhook/evolution';
  crmRouter(req, res, next);
});
app.use('/api', crmRouter);



// Arquivo estatico inexistente precisa responder 404 de verdade. Sem isso o
// index.html volta com HTTP 200 e o navegador tenta decodificar HTML como imagem.
// Rotas de SPA sem extensao (/crm/lead/123) continuam servindo o index.html.
const STATIC_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|map|woff2?|ttf|mp4|webm)$/i;
const looksLikeStatic = (req) => STATIC_EXT.test(req.path);

// 1. Landing Page / Presell Oficial
app.get(['/presell', '/apresentacao', '/start', '/como-funciona'], (req, res) => {
  enviarHtml(req, res, 'presell.html');
});

// 2. Rota para Nexus CRM SPA
app.get(['/crm', '/crm/*', '/nexus'], (req, res) => {
  if (looksLikeStatic(req)) return res.status(404).json({ error: 'Not found' });
  enviarHtml(req, res, 'crm/index.html');
});

// 3. Rota para o Painel Administrativo Master
app.get('/admin', (req, res) => {
  enviarHtml(req, res, 'admin.html');
});

// 4. Rota para o Terminal de Autenticacao (login/cadastro)
app.get('/login', (req, res) => {
  enviarHtml(req, res, 'login.html');
});

// 5. Paginas legais sem extensao
app.get('/termos', (req, res) => {
  enviarHtml(req, res, 'termos.html');
});
app.get('/privacidade', (req, res) => {
  enviarHtml(req, res, 'privacidade.html');
});

// 6. Rota para o Aplicativo / Dashboard do Operador
app.get(['/app', '/dashboard', '/painel', '/home'], (req, res) => {
  enviarHtml(req, res, 'index.html');
});

// 4. Fallback para SPA
app.get('*', (req, res) => {
  if (looksLikeStatic(req)) return res.status(404).json({ error: 'Not found' });
  enviarHtml(req, res, 'index.html');
});

// Inicialização com Banco de Dados
async function startServer() {
  try {
    // Carrega config/site.json uma vez e avisa o que falta preencher
    require('./services/siteConfig').carregar();

    await initDb();

    // Inicializa Bot do Telegram (se token estiver presente)
    initTelegramBot();

    server.listen(PORT, HOST, () => {
      console.log(`=================================================`);
      console.log(`🚀 TRUCKAUTO + Nexus CRM Online na porta ${PORT}`);
      console.log(`📊 Painel Operador: http://localhost:${PORT}`);
      console.log(`🛰️ Nexus CRM 24/7: http://localhost:${PORT}/crm`);
      console.log(`=================================================`);

// Inicia o Watchdog de Alta Disponibilidade 24/7 (Anti-Sleep & Auto-Cura)
const watchdog = require('./services/keepAliveWatchdog');
watchdog.start();
// Agenda backup diario automatico (04:00) para o Telegram do admin
try { require('./services/backup').scheduleBackup(); } catch (e) { console.error('[BACKUP SCHED ERROR]:', e.message); }
// Gotejamento de rendimentos: 1 fatia por hora (24 fatias = 1 dia)
try {
  const cron = require('node-cron');
  cron.schedule('7 * * * *', () => {
    require('./services/settlementEngine').processDripSlice().catch(e => console.error('[DRIP SCHED ERROR]:', e.message));
  });
  console.log('[DRIP] gotejamento horario agendado.');
} catch (e) { console.error('[DRIP SCHED ERROR]:', e.message); }
    });
  } catch (err) {
    console.error('Falha crítica ao iniciar o servidor:', err);
    process.exit(1);
  }
}

startServer();

