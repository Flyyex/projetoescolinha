const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '8080')
  ? 'http://localhost:3000/api' 
  : '/api';

const formatCurrency = (value) => {
  let locale = 'pt-BR';
  try {
    if (typeof window !== 'undefined' && window.TruckAutoI18n) locale = window.TruckAutoI18n.LOCALES[window.TruckAutoI18n.getLang()] || 'pt-BR';
  } catch (e) { locale = 'pt-BR'; }
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  } catch (e) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  }
};

// Locale de exibição (datas/horas visíveis ao humano) segue o idioma ativo, como formatCurrency.
// Chaves lógicas de data (en-CA day keys, ISO strings, localeCompare) ficam INTACTAS.
const i18nDateLocale = () => {
  try {
    if (typeof window !== 'undefined' && window.TruckAutoI18n) return window.TruckAutoI18n.LOCALES[window.TruckAutoI18n.getLang()] || 'pt-BR';
  } catch (e) {}
  return 'pt-BR';
};

// Remove nomes de gateway do texto exibido (ex: "SyncPay" -> "TruckAuto")
const cleanTxText = (s) => escHtml(s).replace(/syncpay|asaas|cartpanda/gi, 'TruckAuto');

const appState = {
  token: localStorage.getItem('truckauto_token') || null,
  user: null,
  balance: 0.00,
  investBalance: 0.00,
  earnBalance: 0.00,
  totalDeposited: 0.00,
  dailyIncome: 0.00,
  totalIncome: 0.00,
  balanceVisible: true,
  theme: 'dark',
  currentFilter: 'all',
  productType: 'vehicles',
  currentCity: 'all',
  activeVehicles: [],
  transactions: [],
  currentHistoryFilter: 'all',
  products: [
    {
      id: 'NX-030',
      name: 'TruckAuto Pulse',
      category: 'economy',
      status: 'Disponível',
      price: 30.00,
      dailyReturn: 3.80,
      periodDays: 15,
      checkoutUrl: 'https://SEU_GATEWAY.com/checkout/212260809:1',
      description: 'Drone compacto para entregas rapidas urbanas e mapeamento de rotas.'
    },
    {
      id: 'NX-101',
      name: 'TruckAuto Zephyr',
      category: 'economy',
      status: 'Disponível',
      price: 150.00,
      dailyReturn: 11.20,
      periodDays: 30,
      checkoutUrl: '/login',
      description: 'Drone agil para operacoes urbanas diarias de entrega.'
    },
    {
      id: 'NX-202',
      name: 'TruckAuto Dash',
      category: 'popular',
      status: 'Alta Demanda',
      price: 350.00,
      dailyReturn: 30.00,
      periodDays: 30,
      checkoutUrl: '/login',
      description: 'Drone com sensores LiDAR e IA de navegacao de nivel 4.'
    },
    {
      id: 'NX-707',
      name: 'TruckAuto Swift',
      category: 'popular',
      status: 'Alta Demanda',
      price: 600.00,
      dailyReturn: 68.00,
      periodDays: 40,
      checkoutUrl: '/login',
      description: 'Drone com recarga por inducao e operacao 24/7.'
    },
    {
      id: 'NX-404',
      name: 'TruckAuto Falcon',
      category: 'popular',
      status: 'Alta Demanda',
      price: 900.00,
      dailyReturn: 75.00,
      periodDays: 45,
      checkoutUrl: '/login',
      description: 'Drone de medio porte para transporte de cargas compartilhadas.'
    },
    {
      id: 'NX-303',
      name: 'TruckAuto Stratus',
      category: 'vip',
      status: 'VIP',
      price: 1500.00,
      dailyReturn: 150.00,
      periodDays: 45,
      checkoutUrl: '/login',
      description: 'Drone de alta capacidade operando em rotas corporativas.'
    },
    {
      id: 'NX-505',
      name: 'TruckAuto Titan',
      category: 'vip',
      status: 'VIP',
      price: 2800.00,
      dailyReturn: 150.00,
      periodDays: 60,
      checkoutUrl: '/login',
      description: 'Drone pesado de alta autonomia para operacoes em areas densas.'
    },
    {
      id: 'NX-606',
      name: 'TruckAuto Apex',
      category: 'vip',
      status: 'VIP',
      price: 5000.00,
      dailyReturn: 250.00,
      periodDays: 60,
      checkoutUrl: '/login',
      description: 'Drone executivo premium com troca de bateria em 3 min.'
    }
  ],
  team: {
    totalMembers: 0,
    activeMembers: 0,
    totalCommission: 0.00,
    levels: [
      { id: 1, name: 'Nível 1 (Diretos)', percent: 10, members: 0, generated: 0.00, icon: 'fa-users-viewfinder' },
      { id: 2, name: 'Nível 2', percent: 5, members: 0, generated: 0.00, icon: 'fa-network-wired' },
      { id: 3, name: 'Nível 3', percent: 2, members: 0, generated: 0.00, icon: 'fa-diagram-project' }
    ]
  }
};

// Limites de valores (vêm do admin via /public-settings; fallback = padrão)
const appLimits = { minDeposit: 20, minWithdraw: 15, withdrawFee: 10 };
async function loadAppLimits() {
  try {
    const r = await fetch('/api/admin/public-settings');
    const s = await r.json();
    if (s) {
      if (isFinite(parseFloat(s.minDeposit))) appLimits.minDeposit = parseFloat(s.minDeposit);
      if (isFinite(parseFloat(s.minWithdraw))) appLimits.minWithdraw = parseFloat(s.minWithdraw);
      if (isFinite(parseFloat(s.withdrawFee))) appLimits.withdrawFee = parseFloat(s.withdrawFee);
    }
  } catch (e) {}
  // formatCurrency, e nao toFixed: toFixed devolvia "20.00" e "15.00", com ponto.
// Em portugues, valor em real com ponto parece erro de digitacao.
const depInput = document.getElementById('deposit-amount');
  if (depInput) {
    depInput.placeholder = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.minDepPh', { min: formatCurrency(appLimits.minDeposit) }) : `Mínimo R$ ${formatCurrency(appLimits.minDeposit)}`;
    depInput.min = appLimits.minDeposit;
  }
  const wdInput = document.getElementById('withdraw-amount');
  if (wdInput) wdInput.placeholder = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.minWdPh', { min: formatCurrency(appLimits.minWithdraw) }) : `Mínimo R$ ${formatCurrency(appLimits.minWithdraw)}`;
  const wdFeeHint = document.getElementById('withdraw-fee-hint');
  if (wdFeeHint) wdFeeHint.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.feeHint', { fee: appLimits.withdrawFee, net: 100 - appLimits.withdrawFee }) : `Taxa de saque: ${appLimits.withdrawFee}% sobre o valor solicitado. Você recebe ${100 - appLimits.withdrawFee}% via Pix.`;
}

if (typeof window !== 'undefined') window.addEventListener('truckauto:lang', () => { renderVisibleTab(); try { loadAppLimits(); } catch (e) {} try { refreshLangButton(); } catch (e) {} });
const LANG_FLAG = { pt: 'br', es: 'es', en: 'us', zh: 'cn' };
const LANG_CODE = { pt: 'PT', es: 'ES', en: 'EN', zh: '中文' };
function refreshLangButton() {
  const lang = window.TruckAutoI18n ? window.TruckAutoI18n.getLang() : 'pt';
  const flag = document.getElementById('lang-flag');
  if (flag) {
    flag.style.display = '';
    flag.src = 'https://flagcdn.com/w20/' + (LANG_FLAG[lang] || 'br') + '.png';
  }
  const code = document.getElementById('lang-code');
  if (code) code.textContent = LANG_CODE[lang] || 'PT';
  document.querySelectorAll('#modal-lang .lang-opt').forEach((b) => {
    const check = b.querySelector('.lang-check');
    if (check) check.style.visibility = b.getAttribute('data-lang') === lang ? 'visible' : 'hidden';
  });
}
function renderVisibleTab() {
  const active = document.querySelector('.tab-pane.active');
  const id = active ? active.id : 'tab-home';
  if (id === 'tab-home') { renderBalances(); renderActiveVehicles(); renderHomeRecentDeposits(); if (appState.user) updateUserHeader(appState.user); }
  else if (id === 'tab-myfleet') { renderMyFleet(); }
  else if (id === 'tab-products') { renderProducts(appState.currentFilter || 'all'); }
  else if (id === 'tab-team') { renderTeamData(); renderReferralCard(); }
  else if (id === 'tab-profile') { if (appState.user) updateUserHeader(appState.user); }
}

document.addEventListener('DOMContentLoaded', async () => {
  loadAppLimits();
  setupEventListeners();
  
  // Inicializa o mapa de telemetria GPS
  startSettlementTimer();
  setTimeout(initGpsTelemetryMap, 150);

  // Se não estiver logado, redireciona para /login
  if (!appState.token) {
    window.location.href = '/login';
    return;
  }

  updateSupportBadge();
  setInterval(updateSupportBadge, 30000);
  try { refreshLangButton(); } catch (e) {}

  await loadUserData();
});

async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (appState.token) {
    headers['Authorization'] = `Bearer ${appState.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (res.status === 401) {
      localStorage.removeItem('truckauto_token');
      window.location.href = '/login';
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn(`API [${endpoint}] offline.`, err);
    return null;
  }
}

async function loadUserData() {
  // 1. Carrega Perfil do Usuário
  const me = await apiRequest('/auth/me');
  if (me && me.id) {
    appState.user = me;
    updateUserHeader(me);
  }

  // 2. Carrega Resumo da Carteira (Saldo, Rendimento do Dia e Total)
  const wallet = await apiRequest('/wallet/summary');
  if (wallet) {
    appState.balance = wallet.balance || 0.00;
    appState.investBalance = wallet.investBalance || 0.00;
    appState.earnBalance = wallet.earnBalance || 0.00;
    appState.totalDeposited = wallet.totalDeposited || 0.00;
    appState.dailyIncome = wallet.dailyIncome || 0.00;
    appState.totalIncome = wallet.totalIncome || 0.00;
    appState.commissionBalance = wallet.commissionBalance || 0.00;
    appState.dailyReturnsBalance = wallet.dailyReturnsBalance || 0.00;
    appState.isLevel3 = wallet.isLevel3 || false;

    const balEl = document.getElementById('user-balance');
    if (balEl && appState.balanceVisible) balEl.textContent = formatCurrency(appState.balance);
    renderBalances();

    const dailyEl = document.getElementById('stat-daily-income');
    if (dailyEl) {
      // Enquanto a cota nao comeca a render, nao prometer R$ 0,00 como se fosse falha
      const waiting = (appState.activeVehicles || []).some(v => isWaitingToStart(v.startDate));
      dailyEl.textContent = waiting ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('home.tomorrow') : 'Amanhã') : `+ R$ ${formatCurrency(appState.dailyIncome)}`;
      dailyEl.style.color = waiting ? 'var(--accent-gold)' : '';
    }

    const totEl = document.getElementById('stat-total-income');
    if (totEl) totEl.textContent = `R$ ${formatCurrency(appState.totalIncome)}`;
  }

  // 3. Carrega Contratos de Veículos Ativos
  const contracts = await apiRequest('/fleet/my-contracts');
  if (contracts && Array.isArray(contracts)) {
    appState.activeVehicles = contracts.map(c => ({
      id: c.id,
      productId: c.productId,
      name: c.productName,
      dailyEarned: c.dailyReturn,
      daysLeft: c.daysRemaining,
      totalDays: c.totalDays,
      status: c.status,
      dripDay: c.dripDay || null,
      dripCount: c.dripCount || 0,
      startDate: c.startDate || null
    }));
  }

// 4. Carrega Dados de Equipe do Usuário
const team = await apiRequest('/team/overview');
if (team) {
appState.team = team;
}
// 5. Carrega catálogo da API (o que o admin editar vale no app)
await loadProducts();
// Renderiza todos os componentes
  renderProducts();
  renderActiveVehicles();
  renderTeamData();
  renderReferralCard();
  updateCategoryCounts();
  renderHomeRecentDeposits();


  // Verifica parâmetro de contratação direta (?hire=NX-101)
  const urlParams = new URLSearchParams(window.location.search);
  const hireTarget = urlParams.get('hire');
  if (hireTarget) {
    setTimeout(() => {
      hireVehicle(hireTarget);
    }, 400);
  }

  // Popups de entrada: parabéns do bônus (1x por conta) ou boas-vindas (1x ao dia)
  maybeShowEntryModals();
}

// Dia local (Brasília) p/ bloqueios 1x/dia + leitura segura do storage
function todayKeyLocal() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

// Mesma regra do motor (services/settlementEngine.js): 1o dia de rendimento
// = dia seguinte ao da contratacao. Espelha firstYieldDay().
function firstYieldDay(startDate) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return null;
  const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  try {
    return next.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch (e) {
    return next.toISOString().slice(0, 10);
  }
}

// True enquanto a cota ainda nao comeca a render (contratada hoje)
function isWaitingToStart(startDate) {
  const first = firstYieldDay(startDate);
  return !!first && first > todayKeyLocal();
}
// Carência de compra por modelo: 30 dias contados da data da compra do
// contrato mais recente do MESMO modelo. Espelha cooldownsForModel() do servidor.
const PURCHASE_COOLDOWN_DAYS = 30;
function calcCooldown(productId, ownedTotal, maxAllowed) {
  // Mesma regra do servidor (routes/fleet.js): a carência de 30 dias só começa a
  // valer depois que o modelo foi lotado (total de contratos do modelo >= limite).
  // Comprar a 1ª de 2 não trava nada -- a 2ª pode ser comprada na hora.
  if (typeof ownedTotal === 'number' && typeof maxAllowed === 'number' && ownedTotal < maxAllowed) {
    return { bloqueado: false, dias: 0, liberacao: null };
  }
  const doModelo = (appState.activeVehicles || []).filter(v => v.productId === productId && v.startDate);
  if (!doModelo.length) return { bloqueado: false, dias: 0, liberacao: null };
  const ultimo = doModelo.slice().sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
  const liberacaoMs = new Date(ultimo.startDate).getTime() + PURCHASE_COOLDOWN_DAYS * 86400000;
  const restante = liberacaoMs - Date.now();
  if (restante <= 0) return { bloqueado: false, dias: 0, liberacao: null };
  return {
    bloqueado: true,
    dias: Math.max(1, Math.ceil(restante / 86400000)),
    liberacao: new Date(liberacaoMs)
  };
}

function formatDayLabel(dayKey) {
  if (!dayKey) return '';
  const parts = String(dayKey).split('-');
  if (parts.length !== 3) return dayKey;
  return parts[2] + '/' + parts[1];
}

// Parabéns do bônus de boas-vindas tem prioridade sobre o popup diário
async function maybeShowEntryModals() {
  try {
    const uid = appState.user && appState.user.id;
    if (uid && !lsGet('truckauto_bonus_seen_' + uid)) {
      const txs = await apiRequest('/wallet/transactions');
      const bonus = Array.isArray(txs) ? txs.find(t => t.type === 'bonus' && String(t.id || '').indexOf('BNS-SIGNUP') === 0) : null;
      lsSet('truckauto_bonus_seen_' + uid, '1');
      if (bonus) {
        const amtEl = document.getElementById('bonus-celebration-amount');
        if (amtEl) amtEl.textContent = 'R$ ' + formatCurrency(Math.abs(parseFloat(bonus.amount || 0)));
        lsSet('truckauto_welcome_day', todayKeyLocal());
        setTimeout(() => openModal('modal-bonus-celebration'), 700);
        return;
      }
    }
  } catch (e) {}
  maybeShowWelcome();
}

function celebrateBonusGo() {
  closeModal('modal-bonus-celebration');
  switchTab('products');
}

// Popup de boas-vindas TruckAuto: X fecha, Explorar vai para Frotas
function maybeShowWelcome() {
  const today = todayKeyLocal();
  if (lsGet('truckauto_welcome_day') === today) return;
  lsSet('truckauto_welcome_day', today);
  setTimeout(() => openModal('modal-welcome'), 600);
}

function exploreWelcome() {
  closeModal('modal-welcome');
  switchTab('products');
}



function updateUserHeader(user) {
  const greetingEl = document.getElementById('user-greeting');
  if (greetingEl) {
    const hour = new Date().getHours();
    let greeting = window.TruckAutoI18n ? window.TruckAutoI18n.t('home.greetNight') : 'Boa noite';
    if (hour >= 5 && hour < 12) greeting = window.TruckAutoI18n ? window.TruckAutoI18n.t('home.greetMorning') : 'Bom dia';
    else if (hour >= 12 && hour < 18) greeting = window.TruckAutoI18n ? window.TruckAutoI18n.t('home.greetAfternoon') : 'Boa tarde';

    greetingEl.innerHTML = `${greeting}, <br><strong>${escHtml(user.operatorName)}</strong>`;
  }

  const levelBadge = document.getElementById('user-level-badge');
  if (levelBadge) {
    const rankTitle = (appState.team && appState.team.career && appState.team.career.currentRank) 
      ? (appState.team.career.currentRank.badge || appState.team.career.currentRank.name)
      : (user.vipLevel || 'Operador Bronze');
    levelBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> ${escHtml(rankTitle)}`;
  }

  const profileTitle = document.getElementById('profile-operator-title');
  if (profileTitle) profileTitle.textContent = user.operatorName;

  const profilePhone = document.getElementById('profile-operator-phone');
  if (profilePhone) profilePhone.textContent = `+55 ${user.phone}`;

  if (user.totalDeposited !== undefined) appState.totalDeposited = parseFloat(user.totalDeposited || 0);

  const inviteInput = document.getElementById('invite-code');
  if (inviteInput) inviteInput.value = getAffiliateLink();
}


// 5. Catálogo vindo da API (admin manda, app obedece; fallback = lista local)
async function loadProducts() {
  try {
    const apiProducts = await apiRequest('/fleet/products');
    if (Array.isArray(apiProducts) && apiProducts.length > 0) {
      const drones = apiProducts.filter(p => !(p.id || '').startsWith('CH-'));
      const chargers = apiProducts.filter(p => (p.id || '').startsWith('CH-'));
      if (drones.length > 0) appState.products = drones;
      if (chargers.length > 0) CHARGER_PRODUCTS = chargers;
    }
  } catch (e) { /* mantém lista local */ }
}

function updateCategoryCounts() {
  const countAll = document.getElementById('count-all');
  const countPopular = document.getElementById('count-popular');
  const countVip = document.getElementById('count-vip');
  const countEconomy = document.getElementById('count-economy');

  if (countAll) countAll.textContent = appState.products.length;
  if (countPopular) countPopular.textContent = appState.products.filter(p => p.category === 'popular').length;
  if (countVip) countVip.textContent = appState.products.filter(p => p.category === 'vip').length;
  if (countEconomy) countEconomy.textContent = appState.products.filter(p => p.category === 'economy').length;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add('active');

  if (tabId === 'home') {
    setTimeout(() => {
      if (gpsMap) gpsMap.invalidateSize();
      else initGpsTelemetryMap();
    }, 120);
  }

  if (tabId === 'myfleet') {
    renderMyFleet();
    // Garante o extrato carregado (fonte do "total investido")
    if (!appState.transactions || appState.transactions.length === 0) {
      apiRequest('/wallet/transactions').then(t => {
        if (Array.isArray(t)) { appState.transactions = t; renderMyFleet(); }
      }).catch(() => {});
    }
  }

  const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => 
    b.getAttribute('onclick')?.includes(tabId)
  );
  if (activeBtn) activeBtn.classList.add('active');
}

const CITY_MAPPING = {
    'NX-030': 'Kansas City, MO',
    'NX-101': 'Memphis, TN',
    'NX-202': 'Atlanta, GA',
    'NX-707': 'Dallas, TX',
    'NX-404': 'Dallas, TX',
    'NX-303': 'Los Angeles, CA',
    'NX-505': 'Los Angeles, CA',
    'NX-606': 'Los Angeles, CA',
    'CH-050': 'Kansas City, MO',
    'CH-200': 'Memphis, TN',
    'CH-500': 'Atlanta, GA',
    'CH-1200': 'Los Angeles, CA'
  };

let CHARGER_PRODUCTS = [
  {
    id: 'CH-050',
    name: 'Estação Solar Urbana 50kW',
    category: 'economy',
    status: 'Disponivel',
    isSoldOut: false,
    price: 50.00,
    dailyReturn: 4.50,
    periodDays: 15,
    city: 'Kansas City, MO',
    description: 'Ponto de recarga solar fotovoltaica para frotas urbanas compactas.'
  },
  {
    id: 'CH-200',
    name: 'Supercharger Hub 250kW',
    category: 'popular',
    status: 'Alta Demanda',
    isSoldOut: false,
    price: 200.00,
    dailyReturn: 19.00,
    periodDays: 30,
    city: 'Memphis, TN',
    description: 'Estacao de recarga ultrarrapida para drones eletricos.'
  },
  {
    id: 'CH-500',
    name: 'Estação de Troca de Bateria Automática',
    category: 'popular',
    status: 'Disponivel',
    isSoldOut: false,
    price: 500.00,
    dailyReturn: 52.00,
    periodDays: 30,
    city: 'Dallas, TX',
    description: 'Swap station robotica com troca total de pack de bateria em 3 minutos.'
  },
  {
    id: 'CH-1200',
    name: 'Hub Grid Central Metropolitano',
    category: 'vip',
    status: 'VIP',
    isSoldOut: false,
    price: 1200.00,
    dailyReturn: 140.00,
    periodDays: 45,
    city: 'Los Angeles, CA',
    description: 'Terminal de alimentacao de alta densidade para frotas autonomas corporativas.'
  }
];

function switchProductType(type) {
  appState.productType = type;
  document.getElementById('toggle-type-vehicles')?.classList.toggle('active', type === 'vehicles');
  document.getElementById('toggle-type-chargers')?.classList.toggle('active', type === 'chargers');

  const catFilter = document.getElementById('category-filter-scroll');
  if (catFilter) {
    catFilter.style.display = 'flex';
  }

  updateCategoryCounts();
  renderHomeRecentDeposits();
  renderProducts(appState.currentFilter || 'all');
}

function filterByCity(city, btn) {
  appState.currentCity = city;
  document.querySelectorAll('.city-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProducts(appState.currentFilter || 'all');
}

function renderProducts(filter = 'all') {
  const container = document.getElementById('product-list-container');
  if (!container) return;

  appState.currentFilter = filter;

  let baseList = appState.productType === 'chargers' ? CHARGER_PRODUCTS : appState.products;

  // Filtro por Categoria
  let filtered = baseList;
  if (filter === 'popular') {
    filtered = baseList.filter(p => p.category === 'popular');
  } else if (filter === 'vip') {
    filtered = baseList.filter(p => p.category === 'vip');
  } else if (filter === 'economy') {
    filtered = baseList.filter(p => p.category === 'economy');
  }

  // Filtro por Cidade
  if (appState.currentCity && appState.currentCity !== 'all') {
    filtered = filtered.filter(p => {
      const city = p.city || CITY_MAPPING[p.id] || '';
      return city.toLowerCase().includes(appState.currentCity.toLowerCase());
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 16px; color: var(--text-muted); grid-column: 1 / -1;">
        <svg class="fa-drone" viewBox="0 0 512 512" aria-hidden="true" style="width:1em;height:1em;vertical-align:-.125em;font-size: 28px; margin-bottom: 8px; display: block;"><g fill="currentColor"><ellipse cx="108" cy="150" rx="96" ry="20"/><ellipse cx="404" cy="150" rx="96" ry="20"/><rect x="109" y="168" width="8" height="62"/><rect x="395" y="168" width="8" height="62"/><rect x="100" y="230" width="26" height="70" rx="10"/><rect x="386" y="230" width="26" height="70" rx="10"/><rect x="120" y="262" width="92" height="28" rx="10"/><rect x="300" y="262" width="92" height="28" rx="10"/><rect x="208" y="242" width="96" height="96" rx="30"/><rect x="244" y="338" width="24" height="26" rx="8"/><circle cx="256" cy="378" r="28"/></g></svg>
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.noFilter') : 'Nenhum ativo encontrado para esta combinação de filtros.'}</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(prod => {
    let statusClass = 'available';
    if (prod.status === 'Alta Demanda') statusClass = 'hot';
    if (prod.status === 'VIP') statusClass = 'vip';

    const totalReturn = prod.dailyReturn * prod.periodDays;
    const profit = totalReturn - prod.price;
    const roiPercent = Math.round((profit / prod.price) * 100);
    const assignedCity = prod.city || CITY_MAPPING[prod.id] || 'Kansas City, MO';
    const langNow = window.TruckAutoI18n ? window.TruckAutoI18n.getLang() : 'pt';
    const prodName = window.I18nData ? window.I18nData.pickLang(prod, 'name', langNow) : prod.name;
    const prodStatus = window.I18nData ? window.I18nData.pickLang(prod, 'status', langNow) : prod.status;
    const prodDesc = window.I18nData ? window.I18nData.pickLang(prod, 'description', langNow) : prod.description;
    const cityShown = window.I18nData ? window.I18nData.cityName(assignedCity, langNow) : assignedCity;

    const isSoldOut = !!prod.isSoldOut || prod.status === 'Esgotado';

    const isCharger = prod.id.indexOf('CH-') === 0;
    const maxAllowed = isCharger ? 1 : (parseFloat(prod.price || 0) >= 79 ? 1 : 2);
    // Conta so o que esta RENDENDO. Sem o filtro de status, um contrato
    // finalizado continuaria ocupando a vaga e o botao ficaria travado para
    // sempre (o backend liberava, a tela nao). Mesma regra de routes/fleet.js.
    const ownedModel = (appState.activeVehicles || []).filter(v => v.productId === prod.id && v.status === 'Em corrida').length;
    const slotsLeft = Math.max(0, maxAllowed - ownedModel);
    // Carencia de 30 dias por modelo, contada da data da compra (mesma regra do
    // servidor em routes/fleet.js). Ela so vale depois que o modelo foi lotado,
    // entao conta TODOS os contratos do modelo -- nao so os que estao em corrida.
    const totalModel = (appState.activeVehicles || []).filter(v => v.productId === prod.id).length;
    const carencia = calcCooldown(prod.id, totalModel, maxAllowed);
    const unit1 = isCharger ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.unitOneCharger') : 'este ponto') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.unitOneDrone') : 'deste drone');
    const unitN = isCharger ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.unitManyCharger') : 'pontos') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.unitManyDrone') : 'drones deste modelo');
    const limUnit = maxAllowed === 1 ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.unitSg') : 'unidade') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.unitPl') : 'unidades');
    // Durante a carencia o modelo esta bloqueado. Anunciar "voce pode comprar
    // mais 1" junto do botao "Limite deste modelo atingido" se contradiz, entao
    // a nota some (o botao desabilitado ja explica).
    const slotsNote = (carencia && carencia.bloqueado)
      ? ''
      : (slotsLeft > 0
      ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.slotsMore', { n: slotsLeft, unit: slotsLeft === 1 ? unit1 : unitN }) : (`Você pode comprar mais ${slotsLeft} ` + (slotsLeft === 1 ? unit1 : unitN)))
      : (isCharger ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.limitCharger') : 'Limite: 1 ponto de carregamento. Aguarde um contrato finalizar.') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.limitDrone', { max: maxAllowed, unit: limUnit }) : (`Limite: ${maxAllowed} ` + (maxAllowed === 1 ? 'unidade' : 'unidades') + ' deste drone. Aguarde um contrato finalizar.'))));

    return `
      <article class="vehicle-card ${isSoldOut ? 'sold-out-card' : ''}" data-category="${prod.category}">
        <div class="vehicle-header">
          <div>
            <h5>${prodName}</h5>
            <span class="contract-id">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.codeDays', { id: prod.id, days: prod.periodDays }) : ('Código: #' + prod.id + ' • ' + prod.periodDays + ' Dias')}</span>
          </div>
          ${isSoldOut 
            ? '<span class="status-badge" style="background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.35); font-weight: 800;"><i class="fa-solid fa-lock"></i> ' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.soldOutBadge') : '100% ESGOTADO') + '</span>'
            : `<span class="status-badge ${statusClass}">${prodStatus}</span>`
          }
        </div>

        <!-- Tags e Urgência do Lote -->
        <div class="batch-info-row">
          <span class="batch-tag">
            <i class="fa-solid fa-location-dot"></i> ${cityShown}
          </span>
          ${isSoldOut 
            ? '<span class="batch-countdown-badge" style="background: rgba(244,63,94,0.1); color: #f43f5e; border-color: rgba(244,63,94,0.25);"><i class="fa-solid fa-circle-xmark"></i> ' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.lotClosed') : 'Lote Encerrado') + '</span>'
            : '<span class="batch-countdown-badge"><i class="fa-regular fa-clock"></i> ' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.lotCountdown') : 'Lote encerra em:') + ' <strong class="product-batch-timer">${getLiveBatchTime()}</strong></span>'
          }
        </div>
        
        <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.3;">
          ${prodDesc}
        </p>

        <div class="vehicle-metrics">
          <div class="metric">
            <span class="m-title">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.priceCota') : 'Preço Cota'}</span>
            <span class="m-val">R$ ${formatCurrency(prod.price)}</span>
          </div>
          <div class="metric">
            <span class="m-title">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.dailyIncome') : 'Renda Diária'}</span>
            <span class="m-val" style="color: var(--accent-green);">+ R$ ${formatCurrency(prod.dailyReturn)}</span>
          </div>
          <div class="metric">
            <span class="m-title">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.estReturn') : 'Retorno Estimado'}</span>
            <span class="m-val" style="color: var(--primary);">R$ ${formatCurrency(totalReturn)}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 0 4px; font-size: 11px; color: var(--text-muted);">
          <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.netProfit') : 'Lucro Líquido Estimado:'}</span>
          <strong style="color: var(--accent-green); font-size: 12px;">+ R$ ${formatCurrency(profit)} (+${roiPercent}%)</strong>
        </div>

        ${isSoldOut 
          ? `<button class="btn btn-secondary btn-block" onclick="showSoldOutAlert()" style="opacity: 0.7; cursor: not-allowed; background: rgba(255,255,255,0.04); border: 1px dashed rgba(244,63,94,0.35); color: #f87171; font-weight: 700;">
              <i class="fa-solid fa-lock"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.soldOutBtn') : 'Cotas Esgotadas (Aguarde Novo Lote)'}
            </button>`
          : (carencia.bloqueado
            ? `<button class="btn btn-secondary btn-block" disabled style="opacity: 0.6; cursor: not-allowed;">
                 <i class="fa-solid fa-lock"></i> Limite deste modelo atingido
               </button>`
            : (slotsLeft > 0 ? `<button class="btn btn-primary btn-block" onclick="hireVehicle('${prod.id}')">
              <i class="fa-solid fa-bolt"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.rentActivate') : 'Alugar / Ativar Cota'}
            </button>` : `<button class="btn btn-secondary btn-block" disabled style="opacity: 0.6; cursor: not-allowed;">
              <i class="fa-solid fa-lock"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.limitReached') : 'Limite deste modelo atingido'}
            </button>`))}
        ${!isSoldOut && slotsNote ? `<p style="font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 8px;">${slotsNote}</p>` : ''}
      </article>
    `;
  }).join('');
}

function showSoldOutAlert() {
  alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.soldOut') : '⚠️ Todas as cotas deste Ponto de Carregamento estão 100% ESGOTADAS no momento.\n\nUm novo lote será liberado na próxima expansão de rede. Acompanhe os avisos no grupo oficial.');
}

function filterProducts(category) {
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.remove('active'));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  renderProducts(category);
}

function renderActiveVehicles() {
  const container = document.getElementById('active-vehicles-container');
  const countEl = document.getElementById('active-count');
  if (!container || !countEl) return;

  countEl.textContent = appState.activeVehicles.length;

  if (appState.activeVehicles.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 16px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
        <svg class="fa-drone" viewBox="0 0 512 512" aria-hidden="true" style="width:1em;height:1em;vertical-align:-.125em;font-size: 28px; color: var(--text-muted); margin-bottom: 8px;"><g fill="currentColor"><ellipse cx="108" cy="150" rx="96" ry="20"/><ellipse cx="404" cy="150" rx="96" ry="20"/><rect x="109" y="168" width="8" height="62"/><rect x="395" y="168" width="8" height="62"/><rect x="100" y="230" width="26" height="70" rx="10"/><rect x="386" y="230" width="26" height="70" rx="10"/><rect x="120" y="262" width="92" height="28" rx="10"/><rect x="300" y="262" width="92" height="28" rx="10"/><rect x="208" y="242" width="96" height="96" rx="30"/><rect x="244" y="338" width="24" height="26" rx="8"/><circle cx="256" cy="378" r="28"/></g></svg>
        <p style="color: var(--text-muted); font-size: 12px;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.noneActive') : 'Nenhum veículo em operação no momento.'}</p>
        <button class="btn btn-primary" onclick="switchTab('products')" style="margin-top: 10px; padding: 8px 16px; font-size: 12px;">
          ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.explore') : 'Explorar Frotas Disponíveis'}
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = appState.activeVehicles.map((vehicle, idx) => {
    const progressPct = Math.round(((vehicle.totalDays - vehicle.daysLeft) / vehicle.totalDays) * 100);
    let todayKey = '';
    try { todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch (e) {}
    const dripToday = (vehicle.dripDay && vehicle.dripDay === todayKey) ? (parseInt(vehicle.dripCount, 10) || 0) : 0;
    const dripPct = Math.min(100, Math.round((dripToday / 24) * 100));
    // Cota comprada hoje: só começa a render amanhã
    const waiting = isWaitingToStart(vehicle.startDate);
    const startLabel = formatDayLabel(firstYieldDay(vehicle.startDate));
    const simulatedRuns = 12 + (idx * 5) + Math.floor(Math.random() * 4);
    const CITIES = ['Kansas City, MO', 'Memphis, TN', 'Los Angeles, CA', 'Dallas, TX'];
    const activeCity = CITIES[idx % CITIES.length];
    const activeCityShown = window.I18nData ? window.I18nData.cityName(activeCity, window.TruckAutoI18n ? window.TruckAutoI18n.getLang() : 'pt') : activeCity;
    
    return `
      <div class="vehicle-card active-item">
        <div class="vehicle-header">
          <div>
            <h5>${vehicle.name}</h5>
            <span class="contract-id">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.contract', { id: vehicle.id }) : ('Contrato #' + vehicle.id)}</span>
          </div>
          <span class="status-badge running"><i class="fa-solid fa-circle"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t(vehicle.status === 'Em corrida' ? 'fleet.ctRunning' : 'fleet.ctDone') : vehicle.status}</span>
        </div>

        <!-- Telemetria Viva -->
        <div class="telemetry-row">
          <div class="telemetry-tag">
            <span class="telemetry-dot pulse"></span>
            <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.autoOp') : 'Operação Autônoma • '}${activeCityShown}</span>
          </div>
          <div class="settlement-badge">
            <i class="fa-solid fa-route"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.runsToday', { n: simulatedRuns }) : (simulatedRuns + ' corridas hoje')}
          </div>
        </div>

        <div class="vehicle-metrics">
          <div class="metric">
            <span class="m-title">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.dailyIncome') : 'Renda Diária'}</span>
            <span class="m-val" style="color: var(--accent-green);">+ R$ ${formatCurrency(vehicle.dailyEarned)}</span>
          </div>
          <div class="metric">
            <span class="m-title">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.duration') : 'Duração'}</span>
            <span class="m-val">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.daysOf', { left: vehicle.daysLeft, total: vehicle.totalDays }) : (vehicle.daysLeft + ' de ' + vehicle.totalDays + ' dias')}</span>
          </div>
          <div class="metric">
            <span class="m-title">${waiting ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.yieldStart') : 'Início da Render') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.nextSettle') : 'Próx. Liquidação')}</span>
            ${waiting
              ? `<span class="m-val" style="color: var(--accent-gold);">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.tomorrowStart', { label: startLabel }) : ('Amanhã ' + startLabel)}</span>`
              : `<span class="m-val live-settlement-timer" style="color: var(--primary);">--:--:--</span>`}
          </div>
        </div>

        <div class="progress-bar" style="margin-top: 10px;">
          <div class="progress-fill" style="width: 0%;" data-target="${progressPct}%"></div>
        </div>
        ${waiting ? `
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(255,193,7,0.10); border: 1px solid rgba(255,193,7,0.35);">
            <i class="fa-solid fa-hourglass-half" style="color: var(--accent-gold);"></i>
            <span style="font-size: 12px; color: #fff; font-weight: 700;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.startsTomorrow', { label: startLabel }) : ('Começa a render amanhã (' + startLabel + ')')}</span>
          </div>
          <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 6px; text-align: center;">
            ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.fullDaily', { v: formatCurrency(vehicle.dailyEarned), label: startLabel }) : ('A diária completa de R$ ' + formatCurrency(vehicle.dailyEarned) + ' cai a partir da meia-noite de ' + startLabel + '.')}
          </div>
        ` : `
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); margin-top: 6px;">
            <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.todayParts', { d: dripToday }) : ('Hoje: ' + dripToday + '/24 parcelas')}</span>
            <span>${dripPct}% do dia</span>
          </div>
          <div class="progress-bar" style="margin-top: 4px; height: 6px;">
            <div class="progress-fill" style="width: 0%;" data-target="${dripPct}%"></div>
          </div>
        `}

        <button class="btn-track-gps" onclick="trackActiveVehicle('${vehicle.id}', '${vehicle.name}')">
          <i class="fa-solid fa-satellite-dish"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.trackGps') : 'Rastrear Drone no Radar GPS'}
        </button>
      </div>
    `;
  }).join('');

  setTimeout(() => {
    document.querySelectorAll('.progress-fill').forEach(bar => {
      bar.style.width = bar.getAttribute('data-target');
    });
  }, 50);
}

function renderTeamData() {
  const metricsContainer = document.getElementById('team-metrics-container');
  const levelsContainer = document.getElementById('team-levels-container');
  const careerContainer = document.getElementById('career-progress-container');
  if (!metricsContainer || !levelsContainer) return;

  const team = appState.team || { totalMembers: 0, activeMembers: 0, totalCommission: 0, levels: [] };
  const career = team.career || {
    currentRank: { name: 'Operador Bronze', icon: '🥉', badge: '🥉 Bronze' },
    nextRank: { name: 'Supervisor Prata', icon: '🥈', bonus: 50 },
    progressPercent: 0,
    remainingDirects: 5,
    remainingTotal: 5
  };

  // 1. Renderiza Card de Status do Plano de Carreira
  if (careerContainer) {
    careerContainer.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%); border: 1px solid var(--border-bright); border-radius: var(--radius-lg); padding: 18px 16px; box-shadow: 0 4px 20px rgba(0, 240, 255, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 28px;">${escHtml(career.currentRank.icon) || '🥉'}</div>
            <div>
              <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.currentRank') : 'Sua Patente Atual'}</span>
              <h4 style="color: #fff; font-size: 16px; font-weight: 800; margin-top: 2px;">${escHtml(career.currentRank.name)}</h4>
            </div>
          </div>
          ${career.nextRank ? `
            <div style="text-align: right;">
              <span style="font-size: 10px; color: var(--accent-gold); font-weight: 700; background: rgba(245, 158, 11, 0.15); padding: 3px 8px; border-radius: 12px;">
                ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.nextRank', { icon: escHtml(career.nextRank.icon), name: escHtml(career.nextRank.name) }) : ('Próximo: ' + escHtml(career.nextRank.icon) + ' ' + escHtml(career.nextRank.name))}
              </span>
              ${career.nextRank.bonus > 0 ? `<div style="font-size: 11px; color: var(--accent-green); font-weight: 700; margin-top: 4px;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.nextBonus', { v: formatCurrency(career.nextRank.bonus) }) : ('+ R$ ' + formatCurrency(career.nextRank.bonus) + ' Pix')}</div>` : ''}
            </div>
          ` : '<span style="font-size: 11px; color: var(--accent-gold); font-weight: 800;">' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.maxLevel') : '🏆 Nível Máximo') + '</span>'}
        </div>

        ${career.nextRank ? `
          <div style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted); margin-bottom: 6px;">
              <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.progressTo', { name: career.nextRank.name }) : ('Progresso para ' + career.nextRank.name)}</span>
              <strong style="color: var(--primary);">${career.progressPercent}%</strong>
            </div>
            <div class="progress-bar" style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden;">
              <div class="progress-fill" style="width: ${career.progressPercent}%; height: 100%; background: var(--cyan-gradient); border-radius: 10px; transition: width 0.6s ease;"></div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; display: flex; justify-content: space-between;">
              <span>${career.remainingDirects > 0 ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.needDirects', { n: career.remainingDirects }) : ('Faltam <strong>' + career.remainingDirects + '</strong> indicados diretos')) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.directsDone') : 'Diretos concluídos ✅')}</span>
              <span>${career.remainingTotal > 0 ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.needTeam', { n: career.remainingTotal }) : ('Faltam <strong>' + career.remainingTotal + '</strong> na equipe')) : ''}</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 2. Renderiza Métricas Gerais
  metricsContainer.innerHTML = `
    <div class="metric-box">
      <span class="num">${team.totalMembers || 0}</span>
      <span class="desc">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.mTotal') : 'Membros Totais'}</span>
    </div>
    <div class="metric-box">
      <span class="num">${team.directsCount !== undefined ? team.directsCount : (team.activeMembers || 0)}</span>
      <span class="desc">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.mDirect') : 'Indicados Diretos'}</span>
    </div>
    <div class="metric-box">
      <span class="num" style="color: var(--accent-green);">R$ ${formatCurrency(team.totalCommission)}</span>
      <span class="desc">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.mCommission') : 'Comissão Total'}</span>
    </div>
  `;

  // 3. Renderiza os 5 Níveis com Desbloqueio Progressivo
  levelsContainer.innerHTML = (team.levels || []).map(lvl => `
    <div class="level-card" style="border-left: 3px solid ${lvl.unlocked ? 'var(--accent-green)' : 'rgba(255,255,255,0.15)'}; background: ${lvl.unlocked ? 'rgba(0, 240, 255, 0.03)' : 'rgba(255,255,255,0.01)'}; margin-bottom: 10px;">
      <div class="lvl-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; color: #fff; font-size: 13.5px;"><i class="fa-solid ${lvl.icon}"></i> ${escHtml(lvl.name)}</span>
        ${lvl.unlocked 
          ? `<span style="font-size: 11px; background: rgba(0, 229, 255, 0.15); color: var(--accent-green); padding: 3px 8px; border-radius: 12px; font-weight: 800;"><i class="fa-solid fa-lock-open"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.released', { pct: lvl.percent }) : (lvl.percent + '% Liberado')}</span>`
          : `<span style="font-size: 10.5px; background: rgba(245, 158, 11, 0.15); color: var(--accent-gold); padding: 3px 8px; border-radius: 12px; font-weight: 700;"><i class="fa-solid fa-lock"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.locked', { pct: lvl.percent }) : (lvl.percent + '% Bloqueado')}</span>`
        }
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 12px; color: var(--text-muted);">
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.membersActive', { n: lvl.members }) : (lvl.members + ' membros ativos')}</span>
        <strong style="color: var(--accent-green);">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.earnedLine', { v: formatCurrency(lvl.generated) }) : ('+ R$ ' + formatCurrency(lvl.generated) + ' ganhos')}</strong>
      </div>
      ${!lvl.unlocked ? `<div style="font-size: 10.5px; color: var(--text-tertiary); margin-top: 4px;"><i class="fa-solid fa-circle-info"></i> ${lvl.unlockRequirement}</div>` : ''}
    </div>
  `).join('');

  renderReferralCard();
}

function getAffiliateLink() {
  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : (appState.user && appState.user.id ? `NEXO${appState.user.id.replace('usr_', '')}` : 'NEXO');
  const origin = window.location.origin;
  const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  return `${origin}${path}login?ref=${code}`;
}

function renderReferralCard() {
  const container = document.getElementById('referral-box-container');
  if (!container) return;

  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : (appState.user && appState.user.id ? `NEXO${appState.user.id.replace('usr_', '')}` : 'NEXO');
  const fullLink = getAffiliateLink();

  // ESTADO LIBERADO: Link de afiliado sempre acessível para todos os operadores
  container.innerHTML = `
    <div class="referral-box unlocked-affiliate" style="border: 1px solid var(--border-bright); background: rgba(0, 240, 255, 0.04); padding: 20px 16px; border-radius: var(--radius-md);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span class="ref-title" style="color: var(--primary); font-weight: 700; font-size: 13px;">
          <i class="fa-solid fa-circle-check" style="color: var(--accent-green);"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.referralTitle') : 'Seu Link de Afiliado Oficial'}
        </span>
        <span style="font-size: 11px; background: rgba(0, 229, 255, 0.15); color: var(--accent-green); padding: 3px 8px; border-radius: 12px; font-weight: 700;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.activeBadge') : 'Ativo'}</span>
      </div>
      
      <div class="copy-field" style="margin-bottom: 10px;">
        <input type="text" id="invite-code" value="${fullLink}" readonly aria-label="${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.inviteAria') : 'Link de convite'}" style="font-size: 12px; font-family: monospace;">
        <button class="btn-copy" id="btn-copy" onclick="copyInviteCode()" aria-label="${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copyAria') : 'Copiar link direto'}" style="min-width: 95px;">
          <i class="fa-regular fa-copy"></i> <span id="copy-text">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copyInvite') : 'Copiar Link'}</span>
        </button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.yourCode') : 'Seu Código:'} <strong style="color: #fff; font-family: monospace;">${code}</strong></span>
        <span style="color: var(--accent-green); font-size: 11px;"><i class="fa-solid fa-shield-check"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.protected') : '100% Protegido'}</span>
      </div>

      <!-- Botão Destacado WhatsApp -->
      <button class="btn btn-whatsapp-share" onclick="shareOnWhatsApp()">
        <i class="fa-brands fa-whatsapp"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.inviteWhatsapp') : 'Convidar Amigos no WhatsApp'}
      </button>
      
      <div class="copy-feedback" id="copy-feedback" style="display: none; color: var(--accent-green); font-size: 11px; margin-top: 8px; text-align: center;">
        <i class="fa-solid fa-check"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copyFeedback') : 'Link direto com seu código de convite copiado com sucesso!'}
      </div>
    </div>
  `;
}

function copyInviteCode() {
  const fullLink = getAffiliateLink();
  const btn = document.getElementById('btn-copy');
  const copyText = document.getElementById('copy-text');
  const feedback = document.getElementById('copy-feedback');

  navigator.clipboard.writeText(fullLink).then(() => {
    if (btn) btn.classList.add('success');
    if (copyText) copyText.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copiedInvite') : 'Copiado!';
    if (feedback) {
      feedback.style.display = 'block';
      setTimeout(() => { feedback.style.display = 'none'; }, 3000);
    }
    setTimeout(() => {
      if (btn) btn.classList.remove('success');
      if (copyText) copyText.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copyInvite') : 'Copiar Link';
    }, 2500);
  }).catch(() => {
    const input = document.getElementById('invite-code');
    if (input) {
      input.select();
      document.execCommand('copy');
      if (copyText) copyText.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copiedInvite') : 'Copiado!';
    }
  });
}


// Pontos de carregamento NAO vivem em appState.products: loadProducts() joga os
// CH-* em CHARGER_PRODUCTS (app.js:472-474) e e de la que a tela desenha o card
// (app.js:615). Procurar so em appState.products fazia o "Alugar" dos
// carregadores nao abrir nada, em silencio -- sem erro no console.
//
// Funcao pura de proposito: recebe as duas listas, assim da para testar sem
// browser (tests/fleet-hire.test.js).
function buscarProdutoAlugavel(produtos, carregadores, productId) {
  const id = String(productId == null ? '' : productId).trim();
  if (!id) return null;
  // O id vem do atributo onclick, ou seja, sempre string. Comparar com String()
  // evita o caso do id numerico no catalogo.
  return (produtos || []).find(p => String(p.id) === id)
    || (carregadores || []).find(p => String(p.id) === id)
    || null;
}

function hireVehicle(productId) {
  const prod = buscarProdutoAlugavel(appState.products, CHARGER_PRODUCTS, productId);
  if (!prod) {
    // Antes era um return mudo. A pessoa clicava em "Alugar" e nao acontecia
    // nada -- foi exatamente isso que escondeu o bug dos carregadores.
    appNotice('Aviso', 'Nao foi possivel abrir este produto. Atualize a tela e tente de novo.');
    return;
  }
  openHirePayModal(prod);
}

let hirePayProduct = null;
let hirePaySource = null;

function openHirePayModal(prod) {
  hirePayProduct = prod;
  const price = parseFloat(prod.price || 0);
  const invest = appState.investBalance || 0;
  const earn = appState.earnBalance || 0;
  const okInvest = invest >= price;
  const okEarn = earn >= price;

  document.getElementById('hire-pay-title').textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.hireTitle', { name: prod.name }) : ('Alugar ' + prod.name);
  document.getElementById('hire-pay-info').innerHTML =
    window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.hireInfo', { price: formatCurrency(price), ret: formatCurrency(prod.dailyReturn), days: prod.periodDays }) : (`Cota <strong style="color:#fff;">R$ ${formatCurrency(price)}</strong> • ` + `Renda diária <strong style="color:var(--accent-green);">+ R$ ${formatCurrency(prod.dailyReturn)}</strong> • ` + `${prod.periodDays} dias (seg a sáb)`)
  document.getElementById('hire-pay-invest-bal').textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.availBal', { v: formatCurrency(invest), tag: okInvest ? '' : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.insufficientTag') : ' (insuficiente)') }) : (`Disponível: R$ ${formatCurrency(invest)}` + (okInvest ? '' : ' (insuficiente)'));
  document.getElementById('hire-pay-earn-bal').textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.availBal', { v: formatCurrency(earn), tag: okEarn ? '' : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.insufficientTag') : ' (insuficiente)') }) : (`Disponível: R$ ${formatCurrency(earn)}` + (okEarn ? '' : ' (insuficiente)'));

  hirePaySource = okInvest ? 'invest' : (okEarn ? 'earn' : null);
  paintHirePayOptions(okInvest, okEarn);

  document.getElementById('hire-pay-warn').style.display = (!okInvest && !okEarn) ? 'block' : 'none';
  document.getElementById('btn-confirm-hire').style.display = (!okInvest && !okEarn) ? 'none' : 'block';
  document.getElementById('btn-hire-deposit').style.display = (!okInvest && !okEarn) ? 'block' : 'none';
  openModal('modal-hire-pay');
}

function paintHirePayOptions(okInvest, okEarn) {
  const boxI = document.getElementById('hire-pay-invest');
  const boxE = document.getElementById('hire-pay-earn');
  if (boxI) {
    boxI.style.opacity = okInvest ? '1' : '0.45';
    boxI.style.borderColor = hirePaySource === 'invest' ? 'var(--accent-green)' : 'var(--border-color)';
    document.getElementById('hire-pay-invest-radio').textContent = hirePaySource === 'invest' ? '🟢' : '⭕';
  }
  if (boxE) {
    boxE.style.opacity = okEarn ? '1' : '0.45';
    boxE.style.borderColor = hirePaySource === 'earn' ? 'var(--accent-green)' : 'var(--border-color)';
    document.getElementById('hire-pay-earn-radio').textContent = hirePaySource === 'earn' ? '🟢' : '⭕';
  }
}

function selectHirePay(src) {
  if (!hirePayProduct) return;
  const price = parseFloat(hirePayProduct.price || 0);
  const bal = src === 'invest' ? (appState.investBalance || 0) : (appState.earnBalance || 0);
  if (bal < price) return;
  hirePaySource = src;
  paintHirePayOptions((appState.investBalance || 0) >= price, (appState.earnBalance || 0) >= price);
}

async function confirmHirePay() {
  if (!hirePayProduct || !hirePaySource) return;
  const prod = hirePayProduct;
  const src = hirePaySource;
  closeModal('modal-hire-pay');
  hirePayProduct = null;
  const res = await apiRequest('/fleet/hire', 'POST', { productId: prod.id, payFrom: src });

  if (res && res.contract) {
    appState.balance = res.newBalance;
    if (res.paidFrom === 'invest') appState.investBalance = Math.round((appState.investBalance - prod.price) * 100) / 100;
    else if (res.paidFrom === 'earn') appState.earnBalance = Math.round((appState.earnBalance - prod.price) * 100) / 100;
    else await refreshBalances();
    renderBalances();
    renderActiveVehicles();
    renderProducts(appState.currentFilter || 'all');
    if (res.contract) {
      const novo = {
        id: res.contract.id, productId: res.contract.productId, name: res.contract.productName,
        dailyEarned: res.contract.dailyReturn, daysLeft: res.contract.daysRemaining,
        totalDays: res.contract.totalDays, status: res.contract.status,
        dripDay: res.contract.dripDay || null, dripCount: res.contract.dripCount || 0,
        startDate: res.contract.startDate || null
      };
      if (!appState.activeVehicles) appState.activeVehicles = [];
      appState.activeVehicles.push(novo);
      renderActiveVehicles();
      renderMyFleet();
    }
    const startDay = formatDayLabel(firstYieldDay((res.contract && res.contract.startDate) || new Date().toISOString()));
    trackBoth('StartTrial', {
      value: parseFloat(prod.price || 0), currency: 'BRL',
      content_name: prod.name, content_ids: [prod.id], content_type: 'product'
    });
    const doneName = document.getElementById('hire-done-name');
    if (doneName) doneName.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.hireDoneName', { name: prod.name }) : (prod.name + ' entrou na rede');
    const doneStart = document.getElementById('hire-done-start');
    if (doneStart) doneStart.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.hireDoneStart', { day: startDay }) : ('Primeiro rendimento a partir da meia-noite de ' + startDay + '.');
    openModal('modal-hire-done');
  } else if (res && res.error) {
    alert(`Erro: ${res.error}`);
  }
}

async function refreshBalances() {
  try {
    const wallet = await apiRequest('/wallet/summary');
    if (wallet) {
      appState.balance = wallet.balance || 0;
      appState.investBalance = wallet.investBalance || 0;
      appState.earnBalance = wallet.earnBalance || 0;
    }
  } catch (e) {}
}



function setupEventListeners() {
  const toggleBalanceBtn = document.getElementById('toggle-balance');
  const balanceEl = document.getElementById('user-balance');
  const iconBtn = toggleBalanceBtn?.querySelector('i');

  toggleBalanceBtn?.addEventListener('click', () => {
    appState.balanceVisible = !appState.balanceVisible;
    const extra = ['invest-balance', 'earn-balance'].map(id => document.getElementById(id)).filter(Boolean);
    if (appState.balanceVisible) {
      balanceEl.classList.remove('blurred');
      extra.forEach(el => el.classList.remove('blurred'));
      iconBtn.className = 'fa-regular fa-eye';
      toggleBalanceBtn.setAttribute('aria-label', window.TruckAutoI18n ? window.TruckAutoI18n.t('home.hideBalance') : 'Ocultar saldo');
    } else {
      balanceEl.classList.add('blurred');
      extra.forEach(el => el.classList.add('blurred'));
      iconBtn.className = 'fa-regular fa-eye-slash';
      toggleBalanceBtn.setAttribute('aria-label', window.TruckAutoI18n ? window.TruckAutoI18n.t('home.showBalance') : 'Mostrar saldo');
    }
  });

  const themeBtn = document.getElementById('btn-theme-toggle');
  themeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    appState.theme = isLight ? 'light' : 'dark';
    themeBtn.style.transform = 'rotate(360deg)';
    setTimeout(() => themeBtn.style.transform = 'none', 300);
    themeBtn.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  });

  const btnNotification = document.getElementById('btn-notification');
  btnNotification?.addEventListener('click', () => {
    const dot = btnNotification.querySelector('.badge-dot');
    if (dot) dot.classList.remove('pulse');
  });
}

// Sino do suporte: pulsa quando há resposta não lida do admin
async function updateSupportBadge() {
  try {
    if (!appState.token) return;
    const res = await apiRequest('/support/unread');
    const dot = document.querySelector('#btn-notification .badge-dot');
    if (dot) {
      if (res && res.unread > 0) {
        dot.style.display = 'block';
        dot.classList.add('pulse');
      } else {
        dot.style.display = 'none';
        dot.classList.remove('pulse');
      }
    }
  } catch (e) {}

// A cada 30s checa se caiu recarga nova (endpoint leve, so recargas ainda nao
// reportadas): assim o Purchase pro Meta/TikTok sai sozinho, sem o operador
// precisar abrir o Extrato. Pula se a aba estiver escondida: evento nao sai
// de um app em segundo plano e o usuario nao esta convertendo ali.
try {
if (!appState.token) return;
if (typeof document !== 'undefined' && document.hidden) return;
await reportNewDepositPurchases();
} catch (e) {}
}

function copyInviteCode() {
  const codeInput = document.getElementById('invite-code');
  const btnCopy = document.getElementById('btn-copy');
  const feedback = document.getElementById('copy-feedback');
  if (!codeInput || !btnCopy) return;

  navigator.clipboard.writeText(codeInput.value).then(() => {
    btnCopy.classList.add('success');
    btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> <span>' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.copiedShort') : 'Copiado') + '</span>';
    if (feedback) feedback.classList.add('show');

    setTimeout(() => {
      btnCopy.classList.remove('success');
      btnCopy.innerHTML = '<i class="fa-regular fa-copy"></i> <span>' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('common.copy') : 'Copiar') + '</span>';
      if (feedback) feedback.classList.remove('show');
    }, 2500);
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  if (modalId === 'modal-withdraw') {
    const withdrawAvail = document.getElementById('withdraw-available');
    if (withdrawAvail) withdrawAvail.textContent = `R$ ${formatCurrency(appState.earnBalance || 0)}`;

    const warnEl = document.getElementById('withdraw-cota-warning');
    if (warnEl) {
      const minDep = appLimits.minDeposit || 20;
      const depositado = parseFloat(appState.totalDeposited || 0);
      const falta = Math.round((minDep - depositado) * 100) / 100;
      if (depositado < minDep) {
        const wt = document.getElementById('withdraw-cota-warning-text');
        // formatCurrency, e nao toFixed: toFixed devolvia "20.00", com ponto.
        if (wt) wt.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.cotaWarn', { min: formatCurrency(minDep) }) : (`Para sacar, sua conta precisa ter ao menos R$ ${formatCurrency(minDep)} em depósitos.`);
        warnEl.style.display = 'block';

        // Quem esta barrado nao pode resolver nada dentro do modal: tinha que
        // sair, achar o botao de recarga e voltar. Botao aqui do lado, com o
        // valor que ainda falta e o CPF ja salvo quando existe.
        const recar = document.getElementById('withdraw-recharge-btn');
        const quanto = document.getElementById('withdraw-recharge-amount');
        if (recar) {
          recar.style.display = 'flex';
          recar.setAttribute('onclick', `irParaRecarga(${falta})`);
        }
        if (quanto) quanto.textContent = `R$ ${formatCurrency(falta)}`;
      } else {
        warnEl.style.display = 'none';
        const recar = document.getElementById('withdraw-recharge-btn');
        if (recar) recar.style.display = 'none';
      }
    }
  } else if (modalId === 'modal-deposit') {
    const fa = document.getElementById('deposit-form-area');
    const qa = document.getElementById('deposit-qr-area');
    if (fa) fa.style.display = 'block';
    if (qa) qa.style.display = 'none';
    const qb = document.getElementById('deposit-qrcode');
    if (qb) qb.innerHTML = '';
    const docSaved = localStorage.getItem('truckauto_cpf');
    const docEl = document.getElementById('deposit-doc');
    if (docEl && docSaved && !docEl.value) docEl.value = docSaved;
  }
  
  modal.classList.add('open');
}

// Leva do modal de saque para o de recarga ja com o valor que falta. Sem isso a
// pessoa era barrada pelo requisito de deposito e nao tinha nenhum caminho
// dentro da tela onde ela estava.
function irParaRecarga(falta) {
  closeModal('modal-withdraw');
  openModal('modal-deposit');
  const campo = document.getElementById('deposit-amount');
  if (!campo) return;
  const v = Math.max(20, Math.ceil(parseFloat(falta || 0) * 100) / 100);
  campo.value = String(v);
  const doc = document.getElementById('deposit-doc');
  const docSaved = localStorage.getItem('truckauto_cpf');
  if (doc && docSaved && !doc.value) doc.value = docSaved;
  setTimeout(() => { try { campo.focus(); } catch (e) {} }, 120);
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    const inputs = modal.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
  }
}

function closeModalOutside(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}

// Atualiza os 3 saldos na tela (total + investir + saque)
function renderBalances() {
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && appState.balanceVisible) el.textContent = formatCurrency(v);
  };
  set('user-balance', appState.balance);
  set('invest-balance', appState.investBalance || 0);
  set('earn-balance', appState.earnBalance || 0);
  const wd = document.getElementById('withdraw-available');
  if (wd) wd.textContent = `R$ ${formatCurrency(appState.earnBalance || 0)}`;
}

async function processDeposit() {
  const input = document.getElementById('deposit-amount');
  const amount = parseFloat(input?.value);
  const docInput = document.getElementById('deposit-doc');
  let doc = (docInput?.value || localStorage.getItem('truckauto_cpf') || '').replace(/\D/g, '');
  const btn = document.getElementById('btn-generate-pix');
  if (!amount || amount < appLimits.minDeposit) return alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.minDeposit', { min: formatCurrency(appLimits.minDeposit) }) : `O valor mínimo de recarga é R$ ${formatCurrency(appLimits.minDeposit)}.`);
  if (!(doc.length === 11 || doc.length === 14)) return alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.docInvalid') : 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
  if (btn) { btn.disabled = true; btn.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.genBusy') : 'Gerando...'; }
  try {
    const res = await apiRequest('/wallet/deposit/pix', 'POST', { amount, cpfCnpj: doc });
    if (!res || !res.pixCopyPaste) {
      alert(res?.error || (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.qrError') : 'Erro ao gerar QR Code. Tente novamente.'));
      return;
    }
    document.getElementById('deposit-form-area').style.display = 'none';
    document.getElementById('deposit-qr-area').style.display = 'block';
    document.getElementById('deposit-qr-amount').textContent = `R$ ${formatCurrency(amount)}`;
    const qrBox = document.getElementById('deposit-qrcode');
    qrBox.innerHTML = '';
    new QRCode(qrBox, { text: res.pixCopyPaste, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    document.getElementById('deposit-copy-code').value = res.pixCopyPaste;
    try { localStorage.setItem('truckauto_cpf', doc); } catch (e) {}
    if (window.fbq) { try { trackBoth('InitiateCheckout', { value: amount, currency: 'BRL' }); } catch (e) {} }
    const mins = res.expiresInSeconds ? Math.round(res.expiresInSeconds / 60) : 0;
    document.getElementById('deposit-expires').textContent = mins
      ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.expiresMin', { mins: mins }) : ('O código expira em aproximadamente ' + mins + ' minutos. Após o pagamento, o saldo cai automaticamente.'))
      : (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.expiresAlways') : 'Após o pagamento, o saldo cai automaticamente.');
  } catch (err) {
    alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('common.connError') : 'Erro de conexão. Tente novamente.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.genBtn') : 'Gerar QR Code Pix'; }
  }
}

function copyDepositCode() {
  const el = document.getElementById('deposit-copy-code');
  if (!el || !el.value) return;
  const done = () => alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixCopied') : 'Código Pix copiado!');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(el.value).then(done).catch(() => { el.select(); document.execCommand('copy'); done(); });
  } else {
    el.select(); document.execCommand('copy'); done();
  }
}

function backToDepositForm() {
  document.getElementById('deposit-qr-area').style.display = 'none';
  document.getElementById('deposit-form-area').style.display = 'block';
  document.getElementById('deposit-qrcode').innerHTML = '';
}

// Chat de suporte in-app (polling a cada 5s com modal aberto)
// Escapa HTML antes de interpolar qualquer dado (usuário/API) no innerHTML: anti-XSS
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const SUPPORT_TICKET_MARK = '🎧 SOLICITAÇÃO DE ATENDIMENTO HUMANO';
function supportCategories() { return [window.TruckAutoI18n ? window.TruckAutoI18n.t('support.catWithdraw') : '💰 Saques e rendimentos', window.TruckAutoI18n ? window.TruckAutoI18n.t('support.catFleet') : '🚁 Frotas e cotas', window.TruckAutoI18n ? window.TruckAutoI18n.t('support.catNetwork') : '👥 Indicações e rede', window.TruckAutoI18n ? window.TruckAutoI18n.t('support.catOther') : '❓ Outro assunto']; }
function supportBubbleHtml(m) {
  const mine = m.sender !== 'admin';
  const when = m.createdAt ? new Date(m.createdAt).toLocaleString(i18nDateLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const ticks = mine ? ' <span style="color: #5bc8ff; font-size: 10px;">✓✓</span>' : '';
  const txt = escHtml(m.text);
  // Cartão de solicitação do atendimento guiado
  if (m.text && String(m.text).indexOf(SUPPORT_TICKET_MARK) === 0) {
    const lines = String(m.text).split('\n').map(s => escHtml(s.trim())).filter(Boolean);
    const body = lines.slice(1).join('<br>');
    return `<div style="display: flex; flex-direction: column; align-items: ${mine ? 'flex-end' : 'flex-start'};">
    <div style="max-width: 88%; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; line-height: 1.5; background: rgba(11,99,229,0.16); color: #fff; border: 1px solid rgba(11,99,229,0.45);">
      <div style="font-weight: 800; font-size: 12px; margin-bottom: 4px;">${lines[0]}</div>
      <div style="color: #C9D6F2;">${body}</div>
    </div>
    ${when ? `<small style="font-size: 10px; color: var(--text-muted); margin-top: 2px; padding: 0 4px;">${escHtml(when)}${ticks}</small>` : ''}
  </div>`;
  }
  return `<div style="display: flex; flex-direction: column; align-items: ${mine ? 'flex-end' : 'flex-start'};">
    <div style="max-width: 82%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.45; ${
      mine
        ? 'background: var(--primary); color: #fff; border-bottom-right-radius: 4px;'
        : 'background: rgba(255,255,255,0.07); color: #fff; border: 1px solid var(--border-color); border-bottom-left-radius: 4px;'
    }">${txt}</div>
    ${when ? `<small style="font-size: 10px; color: var(--text-muted); margin-top: 2px; padding: 0 4px;">${escHtml(when)}${ticks}</small>` : ''}
  </div>`;
}
function renderSupportCategories(show) {
  const box = document.getElementById('support-categories');
  if (!box) return;
  if (!show) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'grid';
  box.innerHTML = supportCategories().map(c =>
    `<button onclick="sendSupportCategory('${c}')" style="background: rgba(11,99,229,0.12); border: 1px solid rgba(11,99,229,0.4); color: #fff; font-size: 12px; font-weight: 700; border-radius: 10px; padding: 10px 8px; cursor: pointer;">${c}</button>`
  ).join('');
}
async function sendSupportCategory(cat) {
  const text = `${SUPPORT_TICKET_MARK}\nCategoria: ${cat}\nAssunto: Falar com um atendente\nO investidor solicitou atendimento humano pelo chat guiado.`;
  try {
    const res = await apiRequest('/support/messages', 'POST', { text });
    if (res && res.id) await loadSupportMessages();
    else alert(res?.error || (window.TruckAutoI18n ? window.TruckAutoI18n.t('common.sendError') : 'Erro ao enviar.'));
  } catch (err) {
    alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('common.connError') : 'Erro de conexão. Tente novamente.');
  }
}
async function loadSupportMessages() {
  const box = document.getElementById('support-messages');
  if (!box) return;
  try {
    const data = await apiRequest('/support/messages');
    const payload = Array.isArray(data) ? { thread: null, messages: data, lastClosed: null } : (data || {});
    const list = payload.messages || [];
    let closedBanner = '';
    if (!payload.thread && payload.lastClosed) {
      const when = payload.lastClosed.closedAt ? new Date(payload.lastClosed.closedAt).toLocaleString(i18nDateLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      closedBanner = '<div style="text-align: center; background: rgba(0,255,157,0.08); border: 1px solid rgba(0,255,157,0.35); border-radius: 10px; padding: 8px 10px; font-size: 11.5px; color: var(--text-muted); margin-bottom: 4px;">' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('support.closedBanner', { id: escHtml(payload.lastClosed.id), when: when ? ' em ' + when : '' }) : ('✅ Atendimento #' + escHtml(payload.lastClosed.id) + ' encerrado' + (when ? ' em ' + when : '') + '.<br>Abra um novo assunto abaixo 👇')) + '</div>';
    }
    box.innerHTML = closedBanner + (list.length
      ? list.map(supportBubbleHtml).join('')
      : (payload.thread
        ? ('<p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 6px 20px 2px;">' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('support.greeting') : '👋 Olá! Escolha um assunto para começar:') + '</p>')
        : ''));
    renderSupportCategories(!payload.thread);
    box.scrollTop = box.scrollHeight;
    apiRequest('/support/read', 'POST').then(() => updateSupportBadge()).catch(() => {});
  } catch (e) {}
}
async function closeSupportChat() {
  if (!confirm(window.TruckAutoI18n ? window.TruckAutoI18n.t('support.closeConfirm') : 'Encerrar este atendimento? Você poderá abrir outro quando quiser.')) return;
  try {
    await apiRequest('/support/close', 'POST');
  } catch (e) {}
  await loadSupportMessages();
}
async function openSupportChat() {
  openModal('modal-support');
  await loadSupportMessages();
}
async function sendSupportMessage() {
  const input = document.getElementById('support-input');
  const text = (input?.value || '').trim();
  if (!text) return;
  const btn = document.getElementById('btn-send-support');
  if (btn) btn.disabled = true;
  try {
    const res = await apiRequest('/support/messages', 'POST', { text });
    if (res && res.id) {
      input.value = '';
      await loadSupportMessages();
    } else {
      alert(res?.error || (window.TruckAutoI18n ? window.TruckAutoI18n.t('common.sendError') : 'Erro ao enviar.'));
    }
  } catch (err) {
    alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('common.connError') : 'Erro de conexão. Tente novamente.');
  } finally {
    if (btn) btn.disabled = false;
  }
}
setInterval(() => {
  const modal = document.getElementById('modal-support');
  if (modal && modal.classList.contains('open') && !document.hidden) loadSupportMessages();
}, 5000);



// Valida a chave Pix no navegador, contra o tipo escolhido. Espelha
// validatePixKey() do servidor (services/misticpay.js) para dar retorno na hora.
function pixKeyFeedback(key, type) {
  const k = String(key || '').trim();
  if (!k) return { state: 'idle', msg: '' };
  const digits = k.replace(/\D/g, '');
  const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const DDDs = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99'];
  const cpfOk = (d) => {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    let s = 0; for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
    let r = (s * 10) % 11; if (r === 10) r = 0;
    if (r !== +d[9]) return false;
    s = 0; for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
    r = (s * 10) % 11; if (r === 10) r = 0;
    return r === +d[10];
  };
  if (type === 'EMAIL') {
    const at = k.indexOf('@');
    if (at < 0) return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixEmailBad') : 'E-mail inválido. Use nome@dominio.com' };
    if (k.indexOf('@', at + 1) >= 0 || k.slice(at + 1).indexOf('.') < 0 || /\s/.test(k)) return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixEmailBad') : 'E-mail inválido. Use nome@dominio.com' };
    return { state: 'ok', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixEmailOk') : 'E-mail válido.' };
  }
  if (type === 'CHAVE_ALEATORIA') {
    return UUID.test(k) ? { state: 'ok', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixRandOk') : 'Chave aleatória válida.' } : { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixRandBad') : 'São 36 caracteres no formato 12345678-1234-1234-1234-123456789012' };
  }
  if (type === 'CPF') {
    if (!/^\d{11}$/.test(digits)) return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixCpfLen') : 'CPF deve ter 11 dígitos (só números).' };
    if (!cpfOk(digits)) return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixCpfBad') : 'CPF inválido — os dígitos verificadores não conferem. Confira e digite de novo.' };
    return { state: 'ok', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixCpfOk') : 'CPF válido.' };
  }
  if (type === 'TELEFONE') {
    if (!/^\d{11}$/.test(digits)) return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixPhoneLen') : 'Celular: DDD + 9 dígitos (11 no total).' };
    if (DDDs.indexOf(digits.slice(0, 2)) < 0) return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixPhoneDdd', { ddd: digits.slice(0, 2) }) : ('DDD ' + digits.slice(0, 2) + ' não existe.') };
    if (digits[2] !== '9') return { state: 'bad', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixPhoneNine') : 'Depois do DDD, o número precisa começar com 9.' };
    return { state: 'ok', msg: window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.pixPhoneOk') : 'Celular válido.' };
  }
  return { state: 'idle', msg: '' };
}

function validateWithdrawKeyField() {
  const key = document.getElementById('withdraw-key')?.value;
  const type = document.getElementById('withdraw-key-type')?.value;
  const el = document.getElementById('withdraw-key-feedback');
  if (!el) return;
  const r = pixKeyFeedback(key, type);
  if (r.state === 'idle') { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.textContent = (r.state === 'ok' ? '✓ ' : '⚠ ') + r.msg;
  el.style.color = r.state === 'ok' ? 'var(--accent-green)' : '#f87171';
}

// ==========================================
// ABA "MINHA FROTA": todas as cotas do operador
// ==========================================
let myFleetFilter = 'active';

// Quanto a cota JÁ pagou. Cada dia fechado rende exatamente a diaria
// (o motor divide em 24 fatias que somam o valor cheio) e o daysRemaining
// cai so quando o dia fecha. O que sobrou do dia de hoje entra pela fracao.
function contractEarned(v) {
  const daily = parseFloat(v.dailyEarned || 0);
  const total = parseInt(v.totalDays, 10) || 0;
  const left = parseInt(v.daysLeft, 10) || 0;
  const done = Math.max(0, Math.min(total, total - left));
  let earned = daily * done;
  try {
    if (v.dripDay === todayKeyLocal()) {
      earned += daily * ((parseInt(v.dripCount, 10) || 0) / 24);
    }
  } catch (e) {}
  return Math.round(earned * 100) / 100;
}

function renderMyFleet() {
  const summary = document.getElementById('fleet-summary');
  const container = document.getElementById('my-fleet-container');
  if (!summary || !container) return;

  const all = (appState.activeVehicles || []).slice();
  const ativas = all.filter(v => v.status === 'Em corrida');
  const feitas = all.filter(v => v.status !== 'Em corrida');

  // Total investido vem do extrato (valor realmente pago), não do preço atual
  // do catálogo — se o preço mudou depois da compra, o número continua certo.
  const txs = appState.transactions || [];
  const investido = txs
    .filter(t => t.type === 'contract')
    .reduce((a, t) => a + Math.abs(parseFloat(t.amount || 0)), 0);
  const recebido = all.reduce((a, v) => a + contractEarned(v), 0);

  const card = (label, value, cor) =>
    `<div class="fleet-summary-card">
       <span class="fs-label">${label}</span>
       <span class="fs-value" ${cor ? `style="color: ${cor};"` : ''}>${value}</span>
     </div>`;

  summary.innerHTML =
    card(window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.sumActive') : 'Cotas ativas', String(ativas.length), 'var(--primary)') +
    card(window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.sumInvested') : 'Total investido', `R$ ${formatCurrency(investido)}`) +
    card(window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.sumReceived') : 'Total recebido', `R$ ${formatCurrency(recebido)}`, 'var(--accent-green)') +
    card(window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.sumDone') : 'Concluídas', String(feitas.length));

  const af = document.getElementById('fleet-filter-active');
  const df = document.getElementById('fleet-filter-done');
  if (af) af.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.filterActive', { n: ativas.length }) : (`Ativas (${ativas.length})`);
  if (df) df.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.filterDone', { n: feitas.length }) : (`Concluídas (${feitas.length})`);
  if (af) af.classList.toggle('active', myFleetFilter === 'active');
  if (df) df.classList.toggle('active', myFleetFilter === 'done');

  if (all.length === 0) {
    container.innerHTML = `<div class="empty-fleet">
        <i class="fa-solid fa-layer-group"></i>
        <h5>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.noQuotas') : 'Você ainda não tem cotas'}</h5>
        <p>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.pickCatalog') : 'Escolha uma frota no catálogo para começar a render.'}</p>
        <button class="btn btn-primary" onclick="switchTab('products')">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.viewCatalog') : 'Ver catálogo'}</button>
      </div>`;
    return;
  }

  const list = (myFleetFilter === 'active' ? ativas : feitas).slice()
    .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-fleet">
        <i class="fa-solid fa-${myFleetFilter === 'active' ? 'hourglass-half' : 'circle-check'}"></i>
        <h5>${myFleetFilter === 'active' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.noActive') : 'Nenhuma cota ativa') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.noDone') : 'Nenhuma cota concluída ainda')}</h5>
        <p>${myFleetFilter === 'active' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.allDoneMsg') : 'Todas as suas cotas já terminaram o ciclo.') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.appearsHere') : 'Quando uma cota conclui o período, ela aparece aqui.')}</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(v => {
    const total = parseInt(v.totalDays, 10) || 0;
    const left = parseInt(v.daysLeft, 10) || 0;
    const done = Math.max(0, Math.min(total, total - left));
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const waiting = isWaitingToStart(v.startDate);
    const done2 = v.status !== 'Em corrida';
    const earned = contractEarned(v);
    const startLabel = formatDayLabel(firstYieldDay(v.startDate));

    const statusBadge = done2
      ? `<span class="status-badge finished"><i class="fa-solid fa-check"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.badgeDone') : 'Concluída'}</span>`
      : waiting
        ? `<span class="status-badge waiting"><i class="fa-solid fa-hourglass-half"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.badgeWaiting') : 'Aguardando'}</span>`
        : `<span class="status-badge running"><i class="fa-solid fa-circle"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.badgeRunning') : 'Em corrida'}</span>`;

    const linha = done2
      ? `<div class="fleet-meta"><i class="fa-solid fa-flag-checkered"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.cycleDone', { n: total }) : ('Ciclo de ' + total + ' dias concluído')}</div>`
      : waiting
        ? `<div class="fleet-meta waiting"><i class="fa-solid fa-hourglass-half"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.startsTomorrow', { label: startLabel }) : ('Começa a render amanhã (' + startLabel + ')')}</div>`
        : `<div class="fleet-meta"><i class="fa-solid fa-calendar-day"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.daysProgress', { done: done, total: total, left: left }) : (done + ' de ' + total + ' dias · Faltam ' + left + ' dias')}</div>`;

    return `
      <div class="vehicle-card fleet-item ${done2 ? 'is-done' : ''}">
        <div class="vehicle-header">
          <div>
            <h5>${v.name}</h5>
            <span class="contract-id">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.contract', { id: v.id }) : ('Contrato #' + v.id)}</span>
          </div>
          ${statusBadge}
        </div>

        ${linha}

        <div class="progress-bar" style="margin-top: 10px;">
          <div class="progress-fill" style="width: 0%;" data-target="${pct}%"></div>
        </div>

        <div class="fleet-metrics">
          <div class="fleet-metric">
            <span class="fm-label">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.yields') : 'Rende'}</span>
            <span class="fm-val">R$ ${formatCurrency(v.dailyEarned)}<small>${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.perDay') : '/dia'}</small></span>
          </div>
          <div class="fleet-metric highlight">
            <span class="fm-label">${window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.paidYou') : 'Já te pagou'}</span>
            <span class="fm-val">R$ ${formatCurrency(earned)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function setMyFleetFilter(f) {
  myFleetFilter = f;
  renderMyFleet();
}

async function processWithdraw() {

  const amount = document.getElementById('withdraw-amount')?.value;
  const key = document.getElementById('withdraw-key')?.value;
  const keyType = document.getElementById('withdraw-key-type')?.value || 'CPF';
  const btn = document.getElementById('btn-process-withdraw');
  
  if (!key) return alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.fillPix') : 'Preencha a Chave Pix.');
  const chk = pixKeyFeedback(key, keyType);
  if (chk.state === 'bad') {
    return alert((window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.invalidPix', { msg: chk.msg }) : 'Chave Pix inválida: ' + chk.msg) + (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.invalidPixTail') : '\n\nNada foi enviado e nada foi descontado. Confira e tente de novo.'));
  }
  if (!amount || parseFloat(amount) < appLimits.minWithdraw) return alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.minWithdraw', { min: formatCurrency(appLimits.minWithdraw) }) : `O valor mínimo de saque é R$ ${formatCurrency(appLimits.minWithdraw)}.`);
  if (parseFloat(amount) > (appState.earnBalance || 0)) return alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.insufficientEarn') : 'Saldo de saque insuficiente. O saque usa o saldo de saque (ganhos).');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.withdrawBusy') : 'Solicitando...');
  btn.disabled = true;

  const res = await apiRequest('/wallet/withdraw', 'POST', {
    amount: parseFloat(amount),
    pixKey: key,
    pixKeyType: keyType
  });

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    if (res.newEarnBalance !== undefined) appState.earnBalance = res.newEarnBalance;
    renderBalances();
    const net = res.netAmount !== undefined ? res.netAmount : amount;
    alert(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.withdrawOk', { net: formatCurrency(net), fee: appLimits.withdrawFee }) : (`🚀 Saque solicitado! Você recebe R$ ${formatCurrency(net)} (taxa de ${appLimits.withdrawFee}% aplicada).`));
    closeModal('modal-withdraw');
  } else if (res && res.error) {
    alert(res.error);
  }

  btn.innerHTML = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.withdrawBtn') : 'Confirmar Saque';
  btn.disabled = false;
}

async function redeemBonus() {
  const input = document.getElementById('bonus-code');
  const code = (input?.value || '').trim();
  const btn = document.getElementById('btn-redeem-bonus');
  if (!code) return appNotice(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusInvalidT') : 'Cupom inválido', window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusInvalidB') : 'Digite o código do bônus para resgatar.', 'error');
  if (btn) { btn.disabled = true; btn.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusBusy') : 'Resgatando...'; }
  try {
    const res = await apiRequest('/wallet/bonus/redeem', 'POST', { code });
    if (res && res.newBalance !== undefined) {
      appState.balance = res.newBalance;
      if (res.newEarnBalance !== undefined) appState.earnBalance = res.newEarnBalance;
      renderBalances();
      const amtEl = document.getElementById('coupon-done-amount');
      if (amtEl) amtEl.textContent = `R$ ${formatCurrency(res.amount)}`;
      const codeEl = document.getElementById('coupon-done-code');
      if (codeEl) codeEl.textContent = String(code).toUpperCase();
      closeModal('modal-bonus');
      openModal('modal-coupon-done');
    } else {
      appNotice(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusFailT') : 'Não foi possível resgatar', res?.error || (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusFailB') : 'Confira o código e tente de novo.'), 'error');
    }
  } catch (err) {
    appNotice(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusConnT') : 'Erro de conexão', window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusConnB') : 'Não deu para falar com o servidor. Tente novamente.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusBtn') : 'Resgatar'; }
  }
}

// Toast: aviso rápido no canto, some sozinho. Bom pra confirmações leves
// ("copiado!") que não merecem travar a tela com um modal.
function appToast(message, tone) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const t = tone || 'info';
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;align-items:center;gap:9px;padding:11px 15px;margin-top:8px;' +
    'border-radius:12px;font-size:13px;font-weight:600;line-height:1.4;' +
    'background:rgba(11,17,30,0.96);border:1px solid ' +
    (t === 'error' ? 'rgba(248,113,113,0.55)' : t === 'success' ? 'rgba(0,240,255,0.45)' : 'rgba(255,255,255,0.16)') +
    ';color:#fff;box-shadow:0 8px 26px rgba(0,0,0,0.5);' +
    'animation:toast-in 0.25s ease;';
  const ic = t === 'error' ? 'fa-circle-exclamation' : (t === 'success' ? 'fa-circle-check' : 'fa-circle-info');
  const col = t === 'error' ? '#fca5a5' : (t === 'success' ? 'var(--accent-green)' : 'var(--text-main)');
  el.innerHTML = '<i class="fa-solid ' + ic + '" style="color:' + col + ';"></i><span>' + String(message || '') + '</span>';
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
  }, 3200);
}

// Aviso estilizado (substitui o alert feio do navegador).
// tone: 'error' | 'info' | 'success'
function appNotice(title, message, tone) {
  const t = tone || 'info';
  const icon = document.getElementById('notice-icon');
  const ttl = document.getElementById('notice-title');
  const msg = document.getElementById('notice-msg');
  const box = document.getElementById('modal-notice');
  if (!box) return;
  if (icon) icon.textContent = t === 'error' ? '⚠️' : (t === 'success' ? '✅' : 'ℹ️');
  if (ttl) ttl.textContent = title || (window.TruckAutoI18n ? window.TruckAutoI18n.t('common.noticeDefault') : 'Aviso');
  if (msg) {
    msg.textContent = String(message || '');
    msg.style.color = t === 'error' ? '#fca5a5' : 'var(--text-muted)';
  }
  if (box) box.style.borderColor = t === 'error'
    ? 'rgba(248,113,113,0.5)'
    : (t === 'success' ? 'rgba(0,240,255,0.4)' : 'rgba(255,255,255,0.14)');
  openModal('modal-notice');
}

// Meta Pixel: dispara evento só se o pixel estiver ligado (senão nao dá erro)
// TikTok: os nomes dos eventos sao DIFERENTES do Meta. Se o nome nao bater
// exatamente, o TikTok ignora o evento e voce paga por anuncio achando que
// converte. Mapeamento conferido na doc deles (ads.tiktok.com standard events).
const TIKTOK_EVENT_NAMES = {
  Purchase: 'CompletePayment',
  StartTrial: 'Subscribe',
  Lead: 'SubmitForm',
  InitiateCheckout: 'InitiateCheckout',
  AddPaymentInfo: 'AddPaymentInfo',
  CompleteRegistration: 'CompleteRegistration',
  ViewContent: 'ViewContent',
  Contact: 'Contact'
};

// id do clique do TikTok (equivalente ao fbclid). Sem isso o TikTok nao fecha
// a atribuicao entre o clique e a conversao.
function tiktokClickId() {
  try {
    const u = new URLSearchParams(window.location.search);
    return u.get('ttp') || lsGet('tn_ttp') || lsGet('tiktok_ttp') || '';
  } catch (e) { return ''; }
}

function trackTikTok(nome, params) {
  try {
    if (typeof window.ttq === 'undefined') return;
    const nomeTikTok = TIKTOK_EVENT_NAMES[nome] || nome;
    const p = Object.assign({}, params || {});
    const ttp = tiktokClickId();
    if (ttp) p.ttp = ttp;
    window.ttq.track(nomeTikTok, p);
  } catch (e) { /* pixel nunca deve quebrar o app */ }
}

// Dispara o mesmo evento nos dois canais: Meta (fbq) e TikTok (ttq).
function trackBoth(nome, params) {
  trackPixel(nome, params);
  trackTikTok(nome, params);
}

function trackPixel(name, params) {
  try {
    if (typeof window.fbq !== 'function') return;
    window.fbq('track', name, params || {});
  } catch (e) { /* pixel nunca deve quebrar o app */ }
}

async function claimCheckin() {
  const btn = document.getElementById('btn-process-checkin');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.checkinBusy') : 'Verificando...');
  btn.disabled = true;

  const res = await apiRequest('/wallet/checkin', 'POST');

  if (res && res.newBalance !== undefined) {
    appState.balance = res.newBalance;
    if (res.newEarnBalance !== undefined) appState.earnBalance = res.newEarnBalance;
    renderBalances();
    const valor = `R$ ${formatCurrency(res.bonus)}`;
    const amtEl = document.getElementById('checkin-done-amount');
    if (amtEl) amtEl.textContent = valor;
    const stEl = document.getElementById('checkin-done-streak-text');
    if (stEl) stEl.textContent = (res.streak || res.days || 1) > 1
      ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.checkinStreak', { n: res.streak || res.days }) : ((res.streak || res.days) + 'º dia seguido!'))
      : (window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.checkinBack') : 'Volte amanhã para ganhar de novo');
    closeModal('modal-checkin');
    openModal('modal-checkin-done');
  } else if (res && res.error) {
    closeModal('modal-checkin');
    appNotice(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.bonusFailT') : 'Não foi possível resgatar', res.error, 'error');
  } else {
    closeModal('modal-checkin');
    appNotice(window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.checkinNoRespT') : 'Sem resposta do servidor', window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.checkinNoRespB') : 'Não deu para confirmar o bônus. Verifique sua internet e tente de novo.', 'error');
  }

  btn.innerHTML = window.TruckAutoI18n ? window.TruckAutoI18n.t('wallet.checkinBtn') : 'Resgatar Bônus';
  btn.disabled = false;
}

function handleLogout() {
  const confirmLogout = confirm(window.TruckAutoI18n ? window.TruckAutoI18n.t('common.logoutConfirm') : 'Deseja realmente sair da sua conta?');
  if (confirmLogout) {
    localStorage.removeItem('truckauto_token');
    window.location.href = '/login';
  }
}


/* =========================================================
   NOVAS FUNÇÕES: GAMIFICAÇÃO, WHATSAPP, TELEMETRIA, EXTRATO & NOTIFICAÇÕES
   ========================================================= */

// 1. Banner de Carreira no Topo do Início (Gamificação)
function renderHomeCareerBanner() {
  const banner = document.getElementById('home-career-banner');
  if (!banner) return;

  const team = appState.team || {};
  const career = team.career || {
    currentRank: { name: 'Operador Bronze', icon: '🥉' },
    nextRank: { name: 'Supervisor Prata', icon: '🥈', bonus: 50 },
    progressPercent: 0,
    remainingDirects: 5,
    remainingTotal: 5
  };

  if (!career.nextRank) {
    banner.innerHTML = `
      <div class="home-career-header">
        <div class="home-career-rank-info">
          <span class="home-career-rank-icon">${escHtml(career.currentRank.icon)}</span>
          <div>
            <span style="font-size: 10px; color: var(--accent-gold); text-transform: uppercase; font-weight: 800;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.careerPlan') : 'Plano de Carreira'}</span>
            <div class="home-career-rank-title">${escHtml(career.currentRank.name)}</div>
          </div>
        </div>
        <span class="home-career-next-badge" style="background: rgba(0, 229, 255, 0.15); color: var(--accent-green); border-color: rgba(0, 229, 255, 0.3);">
          ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.maxReached') : '🏆 Nível Máximo Atingido'}
        </span>
      </div>
      <div class="home-career-footer">
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.maxDesc') : 'Você recebe o bônus máximo em todas as frotas da sua rede!'}</span>
      </div>
    `;
    return;
  }

  banner.innerHTML = `
    <div class="home-career-header">
      <div class="home-career-rank-info">
        <span class="home-career-rank-icon">${escHtml(career.currentRank.icon)}</span>
        <div>
          <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.yourRank') : 'Sua Patente'}</span>
          <div class="home-career-rank-title">${escHtml(career.currentRank.name)}</div>
        </div>
      </div>
      <span class="home-career-next-badge">
        ${window.TruckAutoI18n ? window.TruckAutoI18n.t('team.goalMeta', { icon: escHtml(career.nextRank.icon), name: escHtml(career.nextRank.name), bonus: formatCurrency(career.nextRank.bonus) }) : ('Meta: ' + escHtml(career.nextRank.icon) + ' ' + escHtml(career.nextRank.name) + ' (+ R$ ' + formatCurrency(career.nextRank.bonus) + ' Pix)')}
      </span>
    </div>
    <div class="home-career-progress-track">
      <div class="home-career-progress-bar" style="width: ${career.progressPercent}%;"></div>
    </div>
    <div class="home-career-footer">
      <span>${career.remainingDirects > 0 ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.needDirectsShort', { n: career.remainingDirects }) : ('Faltam <strong>' + career.remainingDirects + ' diretos</strong> para subir de nível 🚀')) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('team.directsDoneShort') : 'Diretos concluídos! ✅')}</span>
      <span style="color: var(--primary); font-weight: 700;">${career.progressPercent}%</span>
    </div>
  `;
}

// 2. Compartilhar no WhatsApp com 1 Clique
function shareOnWhatsApp() {
  const code = (appState.user && appState.user.inviteCode) ? appState.user.inviteCode : (appState.user && appState.user.id ? `NEXO${appState.user.id.replace('usr_', '')}` : 'NEXO');
  const link = getAffiliateLink();
  const text = window.TruckAutoI18n ? window.TruckAutoI18n.t('team.shareText', { link: link, code: code }) : `🚗 *Opa, tudo bem?*\n\nEstou lucrando de segunda a sábado com frotas de robotáxis elétricos autônomos na *TRUCKAUTO*!\n\n🔹 Cotas acessíveis a partir de *R$ 30,00*\n🔹 Rendimento automático (seg a sáb)\n🔹 Saques rápidos no Pix\n🔹 Bônus em 3 níveis de indicação\n\nCadastre-se pelo meu link oficial e comece hoje mesmo:\n👉 ${link}\n\nCódigo de Convite: *${code}*`;
  
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}


function getLiveBatchTime() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const diff = Math.max(0, midnight - now);

  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getLiveSettlementTimeFormatted() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const diff = Math.max(0, midnight - now);

  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function updateAllClocks() {
  const batchFormatted = getLiveBatchTime();
  const formatted = getLiveSettlementTimeFormatted();

  document.querySelectorAll('.live-settlement-timer').forEach(el => {
    el.textContent = formatted;
  });
  document.querySelectorAll('.product-batch-timer').forEach(el => {
    el.textContent = batchFormatted;
  });
}

let settlementTimerInterval = null;
function startSettlementTimer() {
  if (settlementTimerInterval) clearInterval(settlementTimerInterval);
  updateAllClocks();
  settlementTimerInterval = setInterval(updateAllClocks, 1000);
}

// Inicia imediatamente o loop do relógio
startSettlementTimer();


// 4. Extrato Financeiro com Filtros & Comprovante Pix
async function openHistoryModal() {
  openModal('modal-history');
  const container = document.getElementById('history-items-container');
  if (container) {
    container.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> ' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.loading') : 'Carregando extrato...') + '</div>';
  }

  const txs = await apiRequest('/wallet/transactions');
  if (txs && Array.isArray(txs)) {
    appState.transactions = txs;
    renderHistoryItems(appState.currentHistoryFilter || 'all');
    reportNewDepositPurchases();
  } else {
    if (container) container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-muted);">' + (window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.none') : 'Nenhuma transação encontrada.') + '</p>';
  }
}

// Purchase/AddPaymentInfo para Meta e TikTok.
//
// Quem controla a marcação é o SERVIDOR (transactions.ad_reported_at), não o
// localStorage. Antes a lista de ids ficava no navegador e cada pagina podia
// re-disparar tudo: se o storage sumisse (WebView do WhatsApp) ou passasse de
// 200 ids, o TikTok recebia a mesma compra centenas de vezes -- chegou a 42 mil
// eventos de Purchase para 39 pessoas que depositaram.
//
// Fluxo: pega o que o servidor ainda não marcou -> dispara -> confirma.
let adReportInFlight = false;
async function reportNewDepositPurchases() {
  if (adReportInFlight) return;
  adReportInFlight = true;
  try {
    if (!appState.token) return;
    const deps = await apiRequest('/wallet/purchases');
    if (!Array.isArray(deps) || !deps.length) return;

    const ids = [];
    for (const t of deps) {
      if (t.type !== 'deposit') continue;
      const valor = parseFloat(t.amount || 0);
      if (!(valor > 0)) continue;
      // event_id/eventID estaveis por recarga: e o que permite Meta e TikTok
      // descartarem duplicidade no lado deles.
      const eid = 'dep_' + String(t.id);
      const params = { value: valor, currency: 'BRL', event_id: eid, eventID: eid };
      trackBoth('Purchase', params);
      trackBoth('AddPaymentInfo', params);
      ids.push(String(t.id));
    }
    if (!ids.length) return;
    await apiRequest('/wallet/purchases/reported', 'POST', { ids });
  } catch (e) {
    // Falhou? nao marca: o servidor devolve de novo na proxima checagem e o
    // evento sai uma unica vez. Melhor perder 1 evento que repetir 500.
  } finally {
    adReportInFlight = false;
  }
}

// Chamadas antigas apontam para o novo fluxo (a extrato/home nao disparam mais).
function trackNewDepositPurchases() { return reportNewDepositPurchases(); }

function filterHistory(filterType, btn) {
  appState.currentHistoryFilter = filterType;
  document.querySelectorAll('.history-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderHistoryItems(filterType);
}

function renderHistoryItems(filterType) {
  const container = document.getElementById('history-items-container');
  if (!container) return;

  let list = appState.transactions || [];
  if (filterType !== 'all') {
    list = list.filter(t => t.type === filterType);
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 16px; color: var(--text-muted);">
        <i class="fa-regular fa-folder-open" style="font-size: 28px; margin-bottom: 8px; display: block;"></i>
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.noneCat') : 'Nenhuma transação nesta categoria.'}</span>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(tx => {
    let iconClass = 'history-icon-income';
    let icon = 'fa-arrow-down';
    let typeName = window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.tYield') : 'Rendimento Diário';
    let isPositive = true;

    if (tx.type === 'commission') {
      iconClass = 'history-icon-commission';
      icon = 'fa-users';
      typeName = window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.tCommission') : 'Comissão de Rede';
      isPositive = true;
    } else if (tx.type === 'withdraw') {
      iconClass = 'history-icon-withdraw';
      icon = 'fa-arrow-up';
      typeName = window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.tWithdraw') : 'Saque Pix';
      isPositive = false;
    } else if (tx.type === 'bonus') {
      iconClass = 'history-icon-bonus';
      icon = 'fa-gift';
      typeName = window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.tBonus') : 'Bônus Operacional';
      isPositive = true;
    } else if (tx.type === 'deposit') {
      iconClass = 'history-icon-income';
      icon = 'fa-bolt';
      typeName = window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.tDeposit') : 'Recarga / Cota';
      isPositive = true;
    }

    const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString(i18nDateLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.todayFallback') : 'Hoje');
    const amountVal = Math.abs(tx.amount);

    return `
      <div class="history-item">
        <div class="history-item-info">
          <div class="history-icon-circle ${iconClass}">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div class="history-item-details">
            <strong>${cleanTxText(tx.description) || typeName}</strong>
            <span>${dateStr} • ${window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.statusLabel') : 'Status:'} <strong style="color: ${tx.status === 'approved' ? 'var(--accent-green)' : (tx.status === 'pending' ? 'var(--accent-gold)' : '#f43f5e')}; font-size: 11px;">${tx.status === 'approved' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.stDone') : 'Concluído') : (tx.status === 'pending' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.stPending') : 'Processando') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.stRejected') : 'Rejeitado'))}</strong></span>
          </div>
        </div>
        <div class="history-item-amount">
          <strong style="color: ${isPositive ? 'var(--accent-green)' : '#f43f5e'};">
            ${isPositive ? '+' : '-'} R$ ${formatCurrency(amountVal)}
          </strong>
          ${(tx.type === 'withdraw' || tx.type === 'commission') ? `
            <button class="btn-receipt-view" onclick="openReceiptModal('${tx.id}')">
              <i class="fa-solid fa-receipt"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('hist.receiptBtn') : 'Comprovante'}
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openReceiptModal(txId) {
  const tx = (appState.transactions || []).find(t => t.id === txId);
  const container = document.getElementById('receipt-box-content');
  if (!tx || !container) return;

  const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleString(i18nDateLocale()) : new Date().toLocaleString(i18nDateLocale());
  const amountVal = Math.abs(tx.amount);
  const authHash = 'AUTH-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString().slice(-4);

  container.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-logo">FLYE<span>X</span></div>
      <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; display: block; margin-top: 2px;">
        ${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.title') : 'Comprovante de Liquidação Digital Pix'}
      </span>
    </div>

    <div class="receipt-amount-display">
      <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.settled') : 'Valor Liquidado'}</span>
      <div class="amount-val">R$ ${formatCurrency(amountVal)}</div>
      <div class="receipt-status-stamp">
        <i class="fa-solid fa-circle-check"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.stamp') : 'Liquidado & Autenticado'}
      </div>
    </div>

    <div class="receipt-field-row">
      <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.opType') : 'Tipo de Operação:'}</span>
      <strong>${tx.type === 'withdraw' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.opWithdraw') : 'Saque Pix') : (tx.type === 'commission' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.opCommission') : 'Comissão de Afiliado') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.opYield') : 'Rendimento'))}</strong>
    </div>
    <div class="receipt-field-row">
      <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.beneficiary') : 'Beneficiário / Operador:'}</span>
      <strong>${appState.user ? (escHtml(appState.user.operatorName) || (window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.operator') : 'Operador')) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.operatorTruckAuto') : 'Operador TRUCKAUTO')}</strong>
    </div>
    <div class="receipt-field-row">
      <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.pixKey') : 'Chave Pix:'}</span>
      <strong>${escHtml(tx.pixKey) || (appState.user ? escHtml(appState.user.phone) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.keyRegistered') : 'Chave Cadastrada'))}</strong>
    </div>
    <div class="receipt-field-row">
      <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.dateTime') : 'Data e Hora:'}</span>
      <strong>${dateStr}</strong>
    </div>
    <div class="receipt-field-row">
      <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.txId') : 'ID da Transação:'}</span>
      <strong style="font-family: monospace;">${tx.id}</strong>
    </div>
    <div class="receipt-field-row" style="border-bottom: none;">
      <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('receipt.authProto') : 'Protocolo de Autenticação:'}</span>
      <strong style="font-family: monospace; color: var(--primary);">${authHash}</strong>
    </div>
  `;

  openModal('modal-receipt');
}

// 5. Central de Notificações Ativa
async function openNotificationsModal() {
  const dot = document.querySelector('#btn-notification .badge-dot');
  if (dot) dot.classList.remove('pulse');

  openModal('modal-notifications');
  const container = document.getElementById('notifications-list-container');
  if (!container) return;

  const txs = appState.transactions.length ? appState.transactions : (await apiRequest('/wallet/transactions') || []);
  const team = appState.team || {};
  const career = team.career || {};

  const notifications = [];

  // Resposta do suporte tem prioridade no sino
  try {
    const un = await apiRequest('/support/unread');
    if (un && un.unread > 0) {
      notifications.push({
        icon: 'fa-headset',
        color: 'rgba(0, 240, 255, 0.15)',
        textColor: 'var(--primary)',
        title: window.TruckAutoI18n ? window.TruckAutoI18n.t('support.notifTitle', { n: un.unread, plural: un.unread > 1 ? 's' : '' }) : ('Suporte respondeu (' + un.unread + ' nova' + (un.unread > 1 ? 's' : '') + ')'),
        desc: window.TruckAutoI18n ? window.TruckAutoI18n.t('support.notifDesc') : 'Toque para abrir a conversa.',
        time: window.TruckAutoI18n ? window.TruckAutoI18n.t('support.notifNow') : 'Agora',
        action: 'support'
      });
    }
  } catch (e) {}

  notifications.push(
    {
      icon: 'fa-trophy',
      color: 'rgba(250, 219, 95, 0.15)',
      textColor: 'var(--accent-gold)',
      title: window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.career') : 'Plano de Carreira Ativo',
      desc: career.currentRank ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.careerDesc', { name: escHtml(career.currentRank.name) }) : ('Você é ' + escHtml(career.currentRank.name) + '. Convide operadores para subir de nível e ganhar Pix!')) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.careerDescFallback') : 'Conquiste novas patentes na rede.'),
      time: window.TruckAutoI18n ? window.TruckAutoI18n.t('support.notifNow') : 'Agora'
    },
    {
      icon: 'fa-shield-halved',
      color: 'rgba(0, 240, 255, 0.15)',
      textColor: 'var(--primary)',
      title: window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.security') : 'Segurança & Telemetria 24/7',
      desc: window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.securityDesc') : 'Todas as frotas em operação contam com monitoramento autônomo e liquidação diária.',
      time: window.TruckAutoI18n ? window.TruckAutoI18n.t('support.notifToday') : 'Hoje'
    }
  );

  // Adiciona transações recentes como notificações
  if (Array.isArray(txs)) {
    txs.slice(0, 5).forEach(tx => {
      const isPos = tx.type !== 'withdraw';
      notifications.push({
        icon: tx.type === 'commission' ? 'fa-users' : (tx.type === 'withdraw' ? 'fa-arrow-up' : 'fa-coins'),
        color: isPos ? 'rgba(0, 229, 255, 0.15)' : 'rgba(244, 63, 94, 0.15)',
        textColor: isPos ? 'var(--accent-green)' : '#f43f5e',
        title: cleanTxText(tx.description) || (tx.type === 'withdraw' ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.txWithdraw') : 'Solicitação de Saque') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.txCredit') : 'Crédito de Rendimento')),
        desc: window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.txDesc', { sign: isPos ? '+' : '-', v: formatCurrency(Math.abs(tx.amount)), st: tx.status === 'approved' ? window.TruckAutoI18n.t('notif.approved') : window.TruckAutoI18n.t('notif.processing') }) : ((isPos ? '+' : '-') + ' R$ ' + formatCurrency(Math.abs(tx.amount)) + ' • Status: ' + (tx.status === 'approved' ? 'Aprovado' : 'Processando')),
        time: tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString(i18nDateLocale(), { hour: '2-digit', minute: '2-digit' }) : (window.TruckAutoI18n ? window.TruckAutoI18n.t('notif.recent') : 'Recente')
      });
    });
  }

  container.innerHTML = notifications.map(n => `
    <div class="notification-card"${n.action === 'support' ? ' onclick="closeModal(\'modal-notifications\');openSupportChat()" style="cursor: pointer; border-color: rgba(0,240,255,0.4);"' : ''}>
      <div class="notification-icon" style="background: ${n.color}; color: ${n.textColor};">
        <i class="fa-solid ${n.icon}"></i>
      </div>
      <div class="notification-content" style="flex: 1;">
        <h6>${n.title}</h6>
        <p>${n.desc}</p>
        <span class="notification-time">${n.time}</span>
      </div>
    </div>
  `).join('');
}


/* =========================================================
   MAPA DE TELEMETRIA GPS INTELIGENTE & INTERATIVO
   ========================================================= */

const GPS_CITIES = {
  shenzhen: {
    name: 'Kansas City, MO',
    center: [39.0997, -94.5786],
    zoom: 12,
    connectedCount: 1482,
    tripsCount: 18940,
    routes: [
      { from: 'Downtown Kansas City', to: 'KCI Airport', coords: [[39.0997, -94.5786], [39.1200, -94.6600], [39.3000, -94.7100]] },
      { from: 'River Market', to: 'BNSF Logistics Yard', coords: [[39.1050, -94.5500], [39.1150, -94.6100], [39.1250, -94.6600]] },
      { from: 'Crossroads Tech Center', to: 'Union Station Hub', coords: [[39.0900, -94.5600], [39.0960, -94.5750], [39.0997, -94.5900]] }
    ]
  },
  hangzhou: {
    name: 'Memphis, TN',
    center: [35.1495, -90.0490],
    zoom: 12,
    connectedCount: 2140,
    tripsCount: 27810,
    routes: [
      { from: 'Downtown Memphis', to: 'MEM Airport', coords: [[35.1495, -90.0490], [35.0500, -89.9900], [34.9946, -89.9762]] },
      { from: 'FedEx World Hub', to: 'Mid-South Trade Port', coords: [[35.0400, -89.9700], [35.0000, -90.0500], [34.9700, -90.1200]] },
      { from: 'Shelby Farms Hub', to: 'Piney Woods Terminal', coords: [[35.1600, -90.0500], [35.2000, -90.0900], [35.2400, -90.1200]] }
    ]
  },
  xangai: {
    name: 'Los Angeles, CA',
    center: [34.0522, -118.2437],
    zoom: 11,
    connectedCount: 3650,
    tripsCount: 46290,
    routes: [
      { from: 'Downtown LA', to: 'LAX Airport', coords: [[34.0522, -118.2437], [33.9900, -118.3300], [33.9416, -118.4085]] },
      { from: 'Inland Empire Hub', to: 'Port of Long Beach', coords: [[34.0633, -117.6509], [33.7701, -118.1937], [33.7540, -118.2160]] },
      { from: 'Commerce Corridor', to: 'Vernon Yard', coords: [[34.0000, -118.2200], [33.9900, -118.2300], [34.0000, -118.2450]] }
    ]
  },
  chengdu: {
    name: 'Dallas, TX',
    center: [32.7767, -96.7970],
    zoom: 12,
    connectedCount: 2980,
    tripsCount: 35120,
    routes: [
      { from: 'Downtown Dallas', to: 'DFW Airport', coords: [[32.7767, -96.7970], [32.8400, -96.9700], [32.8998, -97.0403]] },
      { from: 'Dallas Ft Worth Alliance', to: 'Irving Logistics Park', coords: [[32.9870, -97.0200], [32.9000, -96.9900], [32.8300, -96.9600]] },
      { from: 'Trinity Groves', to: 'Mesquite Terminal', coords: [[32.7600, -96.7500], [32.7900, -96.7000], [32.8000, -96.6000]] }
    ]
  }
};;


let gpsMap = null;
let mapVehicleMarkers = [];
let mapActivePolylines = [];
let currentMapCityKey = 'shenzhen';
let mapInitAttempts = 0;

function initGpsTelemetryMap() {
  const mapEl = document.getElementById('gps-telemetry-map');
  if (!mapEl) return;

  if (typeof L === 'undefined') {
    if (mapInitAttempts < 15) {
      mapInitAttempts++;
      setTimeout(initGpsTelemetryMap, 200);
    }
    return;
  }

  if (gpsMap) {
    gpsMap.invalidateSize();
    return;
  }

  const city = GPS_CITIES[currentMapCityKey];

  try {
    gpsMap = L.map('gps-telemetry-map', {
      center: city.center,
      zoom: city.zoom,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      touchZoom: true,
      tap: false
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors'
    }).addTo(gpsMap);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    }).addTo(gpsMap);

    populateMapVehicles();
    startMapVehiclesMotion();
    startTickerRotation();

    setTimeout(() => { if (gpsMap) gpsMap.invalidateSize(); }, 300);
    setTimeout(() => { if (gpsMap) gpsMap.invalidateSize(); }, 1000);
  } catch (err) {
    console.error('[GPS MAP INIT ERROR]:', err);
  }
}

function zoomInMap() {
  if (gpsMap) gpsMap.zoomIn();
}

function zoomOutMap() {
  if (gpsMap) gpsMap.zoomOut();
}

function focusUserOrBestCar() {
  if (!gpsMap) return;
  const userCar = mapVehicleMarkers.find(m => m.isUser);
  if (userCar) {
    gpsMap.flyTo([userCar.lat, userCar.lng], 15, { duration: 1 });
    userCar.marker.openPopup();
    showRideHud(userCar.carData);
  } else if (mapVehicleMarkers.length > 0) {
    const first = mapVehicleMarkers[0];
    gpsMap.flyTo([first.lat, first.lng], 15, { duration: 1 });
    first.marker.openPopup();
    showRideHud(first.carData);
  }
}

function switchMapCity(cityKey, btn) {
  currentMapCityKey = cityKey;
  document.querySelectorAll('.gps-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const city = GPS_CITIES[cityKey];
  if (!city) return;

  const connectedEl = document.getElementById('hud-connected-count');
  const tripsEl = document.getElementById('hud-trips-count');
  refreshGpsHudUnits(connectedEl, tripsEl);

  if (gpsMap) {
    gpsMap.flyTo(city.center, city.zoom, { duration: 1.2 });
    setTimeout(populateMapVehicles, 600);
  }
}

// Valores do HUD com unidade traduzida e milhar do idioma ativo.
function gpsLangTag() {
  try {
    const lang = window.TruckAutoI18n ? window.TruckAutoI18n.getLang() : 'pt';
    return { pt: 'pt-BR', es: 'es-ES', en: 'en-US', zh: 'zh-CN' }[lang] || 'pt-BR';
  } catch (e) { return 'pt-BR'; }
}

function refreshGpsHudUnits(connectedEl, tripsEl) {
  const city = GPS_CITIES[currentMapCityKey];
  if (!city) return;
  const t = (k, fb) => (window.TruckAutoI18n ? window.TruckAutoI18n.t(k) : fb);
  if (connectedEl) connectedEl.textContent =
    Number(city.connectedCount || 0).toLocaleString(gpsLangTag()) + ' ' + t('home.activeUnit', 'ativas');
  if (tripsEl) tripsEl.textContent =
    Number(city.tripsCount || 0).toLocaleString(gpsLangTag()) + ' ' + t('home.tripsUnit', 'operações');
}

if (typeof window !== 'undefined') window.addEventListener('truckauto:lang', () => {
  try {
    refreshGpsHudUnits(document.getElementById('hud-connected-count'), document.getElementById('hud-trips-count'));
  } catch (e) {}
});

function gpsCityKeyForProduct(productId) {
  try {
    const full = (typeof CITY_MAPPING !== 'undefined' && CITY_MAPPING[productId]) || '';
    const norm = full.split(',')[0].trim().toLowerCase();
    const keys = Object.keys(GPS_CITIES);
    const hit = keys.find(k => GPS_CITIES[k].name.split(',')[0].trim().toLowerCase() === norm);
    if (hit) return hit;
    if (keys.includes(norm)) return norm;
  } catch (e) {}
  return currentMapCityKey;
}

function populateMapVehicles() {
  if (!gpsMap) return;

  // Limpa marcadores e rotas anteriores
  mapVehicleMarkers.forEach(m => gpsMap.removeLayer(m.marker));
  mapActivePolylines.forEach(p => gpsMap.removeLayer(p));
  mapVehicleMarkers = [];
  mapActivePolylines = [];

  const city = GPS_CITIES[currentMapCityKey];
  const centerLat = city.center[0];
  const centerLng = city.center[1];

  // 1. Desenha rotas neon no mapa
  (city.routes || []).forEach((r, idx) => {
    const poly = L.polyline(r.coords, {
      color: idx === 0 ? '#00E5FF' : (idx === 1 ? '#00E5FF' : '#FADB5F'),
      weight: 2.5,
      opacity: 0.7,
      dashArray: '5, 8'
    }).addTo(gpsMap);
    mapActivePolylines.push(poly);
  });

  // 2. Veículos do Usuário (ancorados na cidade do próprio produto)
  const userCars = appState.activeVehicles || [];
  userCars.forEach((car, i) => {
    const homeKey = gpsCityKeyForProduct(car.productId);
    const homeCity = GPS_CITIES[homeKey] || GPS_CITIES[currentMapCityKey];
    const homeLat = homeCity.center[0];
    const homeLng = homeCity.center[1];
    const lat = homeLat + (Math.sin(i * 1.5) * 0.012) + (Math.random() * 0.003);
    const lng = homeLng + (Math.cos(i * 1.5) * 0.014) + (Math.random() * 0.003);

    const iconHtml = `
      <div class="vehicle-marker-wrap">
        <div class="vehicle-marker-icon user-car" title="${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.mapTitle', { name: car.name }) : ('SEU VEÍCULO: ' + car.name)}">
          <svg class="fa-drone" viewBox="0 0 512 512" aria-hidden="true" style="width:1em;height:1em;vertical-align:-.125em;"><g fill="currentColor"><ellipse cx="108" cy="150" rx="96" ry="20"/><ellipse cx="404" cy="150" rx="96" ry="20"/><rect x="109" y="168" width="8" height="62"/><rect x="395" y="168" width="8" height="62"/><rect x="100" y="230" width="26" height="70" rx="10"/><rect x="386" y="230" width="26" height="70" rx="10"/><rect x="120" y="262" width="92" height="28" rx="10"/><rect x="300" y="262" width="92" height="28" rx="10"/><rect x="208" y="242" width="96" height="96" rx="30"/><rect x="244" y="338" width="24" height="26" rx="8"/><circle cx="256" cy="378" r="28"/></g></svg>
        </div>
      </div>
    `;
    const customIcon = L.divIcon({ html: iconHtml, className: 'custom-car-icon', iconSize: [32, 32], iconAnchor: [16, 16] });
    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(gpsMap);

    const carData = {
      name: car.name,
      code: window.TruckAutoI18n ? window.TruckAutoI18n.t('fleet.contract', { id: car.id }) : ('Contrato #' + car.id),
      city: homeCity.name,
      speed: 68,
      battery: 89,
      dailyReturn: car.dailyEarned,
      isUser: true,
      routeFrom: homeCity.routes[0]?.from || (window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.defFrom') : 'Ponto de Partida'),
      routeTo: homeCity.routes[0]?.to || (window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.defTo') : 'Destino Corporativo'),
      tripFare: (car.dailyEarned / 3).toFixed(2)
    };

    marker.on('click', () => showRideHud(carData));
    mapVehicleMarkers.push({ marker, lat, lng, isUser: true, carData, anchorLat: lat, anchorLng: lng });
  });

  // 3. Frotas Conectadas da Rede
  const fleetModels = [
    { name: 'TruckAuto Pulse', code: 'NX-030', returnVal: 3.80, routeIdx: 0 },
    { name: 'TruckAuto Zephyr', code: 'NX-101', returnVal: 11.20, routeIdx: 1 },
    { name: 'TruckAuto Dash', code: 'NX-202', returnVal: 30.00, routeIdx: 2 },
    { name: 'TruckAuto Swift', code: 'NX-707', returnVal: 68.00, routeIdx: 0 },
    { name: 'TruckAuto Falcon', code: 'NX-404', returnVal: 75.00, routeIdx: 1 },
    { name: 'TruckAuto Stratus', code: 'NX-303', returnVal: 150.00, routeIdx: 2 }
  ];

  const count = userCars.length ? 5 : 7;
  for (let i = 0; i < count; i++) {
    const model = fleetModels[i % fleetModels.length];
    const rIdx = model.routeIdx || (i % 3);
    const assignedRoute = city.routes[rIdx] || city.routes[0];
    const routeCoord = assignedRoute.coords[i % assignedRoute.coords.length];

    const lat = routeCoord[0] + (Math.random() - 0.5) * 0.003;
    const lng = routeCoord[1] + (Math.random() - 0.5) * 0.003;

    const iconHtml = `
      <div class="vehicle-marker-wrap">
        <div class="vehicle-marker-icon">
          <i class="fa-solid fa-bolt"></i>
        </div>
      </div>
    `;
    const customIcon = L.divIcon({ html: iconHtml, className: 'custom-car-icon', iconSize: [28, 28], iconAnchor: [14, 14] });
    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(gpsMap);

    const speed = 62 + Math.floor(Math.random() * 26);
    const battery = 78 + Math.floor(Math.random() * 20);

    const carData = {
      name: model.name,
      code: model.code,
      city: city.name,
      speed: speed,
      battery: battery,
      dailyReturn: model.returnVal,
      isUser: false,
      routeFrom: assignedRoute.from,
      routeTo: assignedRoute.to,
      tripFare: (model.returnVal / 4 + 4.5).toFixed(2)
    };

    marker.on('click', () => showRideHud(carData));
    mapVehicleMarkers.push({ marker, lat, lng, isUser: false, carData });
  }

  // Abre automaticamente o HUD do primeiro carro
  if (mapVehicleMarkers.length > 0) {
    showRideHud(mapVehicleMarkers[0].carData);
  }
}

function showRideHud(carData) {
  const hud = document.getElementById('live-ride-hud');
  if (!hud || !carData) return;
  try { window.__lastHudCarData = carData; } catch (e) {}

  hud.style.display = 'block';
  hud.innerHTML = `
    <div class="ride-hud-header">
      <div class="ride-car-name">
        ${carData.isUser ? '<svg class="fa-drone" viewBox="0 0 512 512" aria-hidden="true" style="width:1em;height:1em;vertical-align:-.125em;color:var(--accent-green)"><g fill="currentColor"><ellipse cx="108" cy="150" rx="96" ry="20"/><ellipse cx="404" cy="150" rx="96" ry="20"/><rect x="109" y="168" width="8" height="62"/><rect x="395" y="168" width="8" height="62"/><rect x="100" y="230" width="26" height="70" rx="10"/><rect x="386" y="230" width="26" height="70" rx="10"/><rect x="120" y="262" width="92" height="28" rx="10"/><rect x="300" y="262" width="92" height="28" rx="10"/><rect x="208" y="242" width="96" height="96" rx="30"/><rect x="244" y="338" width="24" height="26" rx="8"/><circle cx="256" cy="378" r="28"/></g></svg>' : '<i class="fa-solid fa-bolt" style="color: var(--primary);"></i>'}
        <span>${carData.name}</span>
      </div>
      <span class="ride-status-pill">${carData.isUser ? (window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.ownVehicle') : '⭐ SEU VEÍCULO') : (window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.onRide') : 'EM CORRIDA')}</span>
    </div>

    <div class="ride-route-text">
      <i class="fa-solid fa-route" style="color: var(--primary);"></i>
      <span>${carData.routeFrom} ➔ <strong>${carData.routeTo}</strong></span>
    </div>

    <div class="ride-metrics-grid">
      <div class="ride-metric-item">
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.speed') : 'Velocidade'}</span>
        <strong>${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.speedVal', { s: carData.speed }) : (carData.speed + ' km/h')}</strong>
      </div>
      <div class="ride-metric-item">
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.battery') : 'Bateria / LiDAR'}</span>
        <strong>${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.batteryVal', { b: carData.battery }) : (carData.battery + '% (Nível 4)')}</strong>
      </div>
      <div class="ride-metric-item">
        <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.yield') : 'Rendimento'}</span>
        <strong style="color: var(--accent-green);">${window.TruckAutoI18n ? window.TruckAutoI18n.t('hud.yieldVal', { v: formatCurrency(carData.dailyReturn) }) : ('+ R$ ' + formatCurrency(carData.dailyReturn) + '/dia')}</strong>
      </div>
    </div>
  `;
}

// Re-traduz o HUD quando o dicionário termina de carregar (se ele foi
// montado antes, as chaves cruas ficam assadas no DOM).
if (typeof window !== 'undefined') window.addEventListener('truckauto:lang', () => {
  try {
    const hud = document.getElementById('live-ride-hud');
    if (hud && hud.style.display === 'block' && window.__lastHudCarData) {
      showRideHud(window.__lastHudCarData);
    }
  } catch (e) {}
});

// Movimento ao Vivo
let mapMotionInterval = null;
function startMapVehiclesMotion() {
  if (mapMotionInterval) clearInterval(mapMotionInterval);

  mapMotionInterval = setInterval(() => {
    if (!gpsMap) return;

    mapVehicleMarkers.forEach(item => {
      const deltaLat = (Math.random() - 0.5) * 0.0012;
      const deltaLng = (Math.random() - 0.5) * 0.0012;
      item.lat += deltaLat;
      item.lng += deltaLng;
      if (item.anchorLat !== undefined) {
        item.lat = Math.max(item.anchorLat - 0.015, Math.min(item.anchorLat + 0.015, item.lat));
        item.lng = Math.max(item.anchorLng - 0.015, Math.min(item.anchorLng + 0.015, item.lng));
      }
      item.marker.setLatLng([item.lat, item.lng]);

      // Oscila ligeiramente a velocidade (cruzeiro de drone)
      if (item.carData) {
        item.carData.speed = Math.max(55, Math.min(95, item.carData.speed + Math.floor(Math.random() * 7 - 3)));
      }
    });
  }, 2200);
}

function trackActiveVehicle(contractId, vehicleName) {
  switchTab('home');

  const mapEl = document.getElementById('gps-telemetry-map');
  if (mapEl) {
    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setTimeout(() => {
    if (gpsMap) {
      gpsMap.invalidateSize();
      const userMarker = mapVehicleMarkers.find(m => m.isUser);
      if (userMarker) {
        gpsMap.flyTo([userMarker.lat, userMarker.lng], 15, { duration: 1 });
        userMarker.marker.openPopup();
        showRideHud(userMarker.carData);
      } else {
        const city = GPS_CITIES[currentMapCityKey];
        gpsMap.flyTo(city.center, 14, { duration: 1 });
      }
    }
  }, 400);
}

// Ticker de Atividades Globais
const TICKER_MESSAGES = [
  '🚗 Operador #4064 atingiu 🥈 Supervisor Prata (+ R$ 50 Pix)',
  '⚡ TruckAuto Dash #NX-202 em Kansas City completou 22 operacoes hoje',
  '💰 Saque de R$ 435,00 liquidado com sucesso via Pix',
  '📍 Frota em Memphis com 100% de operação autônoma Nível 4',
  '🔥 Vanessa T. ativou cota TruckAuto Zephyr (R$ 150) em Los Angeles',
  '🎁 Bônus de check-in diário resgatado por mais de 340 operadores hoje'
];
let tickerIdx = 0;
function startTickerRotation() {
  const tickerEl = document.getElementById('ticker-live-text');
  if (!tickerEl) return;

  setInterval(() => {
    tickerIdx++;
    tickerEl.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('home.ticker' + ((tickerIdx % TICKER_MESSAGES.length) + 1)) : TICKER_MESSAGES[tickerIdx % TICKER_MESSAGES.length];
  }, 7000);
}


/* =========================================================
   EXTRATO DE DEPÓSITOS & ENTRADAS ABAIXO DO SALDO (HOME)
   ========================================================= */

async function renderHomeRecentDeposits() {
  const container = document.getElementById('home-recent-deposits-list');
  if (!container) return;

  // Busca transações se ainda não estiverem em memória
  if (!appState.transactions || appState.transactions.length === 0) {
    const txs = await apiRequest('/wallet/transactions');
    if (txs && Array.isArray(txs)) {
      appState.transactions = txs;
    }
  }
  // Dispara o Purchase de qualquer recarga confirmada que ainda não foi
  // reportada. Aqui (home) roda sozinho no login — antes isso so acontecia
  // abrindo o Extrato, e a compra ficava sem evento. Quem controla a marcação
  // é o servidor, então nao depende de localStorage.
  await reportNewDepositPurchases();

  const allTx = appState.transactions || [];
  // Filtra apenas entradas (depósitos, rendimentos, comissões, bônus)
  const incomingTx = allTx.filter(t => t.type !== 'withdraw' && parseFloat(t.amount || 0) > 0);

  if (incomingTx.length === 0) {
    // Se o usuário tem veículos ativos, mostra a previsão de crédito
    if (appState.activeVehicles && appState.activeVehicles.length > 0) {
      const activeCar = appState.activeVehicles[0];
      container.innerHTML = `
        <div class="statement-entry-item">
          <div class="entry-left-col">
            <div class="entry-icon-badge entry-icon-income">
              <svg class="fa-drone" viewBox="0 0 512 512" aria-hidden="true" style="width:1em;height:1em;vertical-align:-.125em;"><g fill="currentColor"><ellipse cx="108" cy="150" rx="96" ry="20"/><ellipse cx="404" cy="150" rx="96" ry="20"/><rect x="109" y="168" width="8" height="62"/><rect x="395" y="168" width="8" height="62"/><rect x="100" y="230" width="26" height="70" rx="10"/><rect x="386" y="230" width="26" height="70" rx="10"/><rect x="120" y="262" width="92" height="28" rx="10"/><rect x="300" y="262" width="92" height="28" rx="10"/><rect x="208" y="242" width="96" height="96" rx="30"/><rect x="244" y="338" width="24" height="26" rx="8"/><circle cx="256" cy="378" r="28"/></g></svg>
            </div>
            <div class="entry-details">
              <h6>${window.TruckAutoI18n ? window.TruckAutoI18n.t('home.schedYield', { name: activeCar.name }) : ('Rendimento Programado: ' + activeCar.name)}</h6>
              <span>${window.TruckAutoI18n ? window.TruckAutoI18n.t('home.autoMidnight') : 'Liquidação automática na próxima meia-noite'}</span>
            </div>
          </div>
          <div class="entry-right-col">
            <span class="entry-amount-val">+ R$ ${formatCurrency(activeCar.dailyEarned)}</span>
            <span style="font-size: 9.5px; color: var(--accent-green); font-weight: 700;">${window.TruckAutoI18n ? window.TruckAutoI18n.t('home.activeBadge') : '🟢 Ativo'}</span>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="text-align: center; padding: 18px 12px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(124,77,255,0.25); border-radius: var(--radius-sm);">
        <i class="fa-solid fa-clock-rotate-left" style="font-size: 22px; color: var(--text-muted); margin-bottom: 6px; display: block;"></i>
        <span style="font-size: 11.5px; color: var(--text-muted);">${window.TruckAutoI18n ? window.TruckAutoI18n.t('home.noCredit') : 'Nenhum crédito recente registrado ainda.'}</span>
        <button class="btn btn-primary" onclick="openModal('modal-deposit')" style="margin-top: 10px; padding: 7px 14px; font-size: 11px; width: auto; display: inline-flex;">
          <i class="fa-solid fa-bolt"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('home.ctaRecharge') : 'Fazer Recarga Pix'}
        </button>
      </div>
    `;
    return;
  }

  // Pega as últimas 3 transações de entrada
  const recentEntries = incomingTx.slice(0, 3);

  container.innerHTML = recentEntries.map(tx => {
    let iconClass = 'entry-icon-income';
    let icon = 'fa-coins';
    let title = cleanTxText(tx.description) || (window.TruckAutoI18n ? window.TruckAutoI18n.t('home.txYield') : 'Rendimento Diário de Frota');

    if (tx.type === 'deposit') {
      iconClass = 'entry-icon-deposit';
      icon = 'fa-arrow-down-to-bracket';
      title = cleanTxText(tx.description) || (window.TruckAutoI18n ? window.TruckAutoI18n.t('home.txDeposit') : 'Recarga Pix Confirmada');
    } else if (tx.type === 'commission') {
      iconClass = 'entry-icon-commission';
      icon = 'fa-users';
      title = cleanTxText(tx.description) || (window.TruckAutoI18n ? window.TruckAutoI18n.t('home.txCommission') : 'Comissão de Afiliado');
    } else if (tx.type === 'bonus' || tx.type === 'adjustment') {
      iconClass = 'entry-icon-bonus';
      icon = 'fa-gift';
      title = cleanTxText(tx.description) || (window.TruckAutoI18n ? window.TruckAutoI18n.t('home.txCareer') : 'Bônus de Carreira');
    }

    const txDate = tx.createdAt ? new Date(tx.createdAt) : new Date();
    const dateFormatted = `${String(txDate.getDate()).padStart(2, '0')}/${String(txDate.getMonth() + 1).padStart(2, '0')} às ${String(txDate.getHours()).padStart(2, '0')}:${String(txDate.getMinutes()).padStart(2, '0')}`;

    return `
      <div class="statement-entry-item">
        <div class="entry-left-col">
          <div class="entry-icon-badge ${iconClass}">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div class="entry-details">
            <h6>${title}</h6>
            <span>${dateFormatted} • ID #${tx.id}</span>
          </div>
        </div>
        <div class="entry-right-col">
          <span class="entry-amount-val">+ R$ ${formatCurrency(Math.abs(tx.amount))}</span>
          <button class="btn-entry-receipt" onclick="viewReceipt('${tx.id}')">
            <i class="fa-solid fa-file-invoice"></i> ${window.TruckAutoI18n ? window.TruckAutoI18n.t('home.receiptBtn') : 'Comprovante'}
          </button>
        </div>
      </div>
    `;
  }).join('');
  updateDailyProgress();
}

// Barra de progresso do dia: creditado hoje vs previsto (reseta a cada dia)
function updateDailyProgress() {
  const fill = document.getElementById('daily-progress-fill');
  if (!fill) return;
  const expected = parseFloat(appState.dailyIncome || 0);
  const todayStr = new Date().toDateString();
  let credited = 0;
  (appState.transactions || []).forEach(tx => {
    if (tx.type !== 'income' || tx.status !== 'approved') return;
    const d = tx.createdAt ? new Date(tx.createdAt) : null;
    if (d && d.toDateString() === todayStr) credited += parseFloat(tx.amount || 0);
  });
  credited = Math.round(credited * 100) / 100;
  const pct = expected > 0 ? Math.min(100, Math.round((credited / expected) * 100)) : 0;
  fill.style.width = pct + '%';
  const credEl = document.getElementById('daily-credited');
  if (credEl) credEl.textContent = 'R$ ' + formatCurrency(credited);
  const pctEl = document.getElementById('daily-progress-pct');
  if (pctEl) pctEl.textContent = window.TruckAutoI18n ? window.TruckAutoI18n.t('home.ofDay', { pct: pct }) : pct + '% do dia';
}


// Portao da COMUNIDADE (grupo WhatsApp + grupo Telegram).
// Regra: so entra quem tem deposito total de R$ 30 ou mais.
// Nao conta mais "ter cota" — e deposito minimo, ponto. (Nao reaproveita o
// appLimits.minDeposit porque esse e o minimo de saque, hoje R$ 20.)
const COMMUNITY_MIN_DEPOSIT = 30;
function isCommunityMember() {
  return parseFloat(appState.totalDeposited || 0) >= COMMUNITY_MIN_DEPOSIT;
}
function communityGateMessage(rede) {
  return '⛔ ACESSO RESTRITO\n\nA comunidade ' + rede + ' é exclusiva para quem já depositou a partir de R$ ' +
    formatCurrency(COMMUNITY_MIN_DEPOSIT) + '.\n\nFaça seu depósito na aba Recarga e volte aqui — o acesso é liberado na hora.';
}
const WHATSAPP_GROUP_URL = 'https://SEU_GRUPO_WHATSAPP?s=cl&p=i&mlu=4&ilr=4';
function openWhatsappGroup(e) {
  if (e) e.preventDefault();
  if (isCommunityMember()) {
    trackBoth('Lead', { content_name: 'Grupo WhatsApp', content_category: 'grupo_whatsapp' });
    window.open(WHATSAPP_GROUP_URL, '_blank');
    return false;
  }
  alert(communityGateMessage('do WhatsApp'));
  return false;
}

// Suporte via WhatsApp direto. Mantem a regra antiga (deposito minimo OU cota),
// porque aqui e atendimento — travar o suporte de quem tem cota ia prejudicar.
const WHATSAPP_SUPPORT_URL = 'https://wa.me/SEU_NUMERO_WHATSAPP';
function isOperatorForSupport() {
  const deposited = parseFloat(appState.totalDeposited || 0) >= (appLimits.minDeposit || 20);
  const ativas = (appState.activeVehicles || []).filter(v => v.status === 'Em corrida' && v.daysLeft > 0);
  return deposited || ativas.length > 0;
}
function openWhatsappSupport(e) {
  if (e) e.preventDefault();
  if (document.getElementById('support-menu')) document.getElementById('support-menu').style.display = 'none';
  if (isOperatorForSupport()) {
    trackBoth('Lead', { content_name: 'Suporte WhatsApp', content_category: 'suporte_whatsapp' });
    window.open(WHATSAPP_SUPPORT_URL, '_blank');
    return false;
  }
  alert('⛔ ACESSO RESTRITO\n\nO suporte via WhatsApp é exclusivo para OPERADORES TRUCKAUTO.\n\nPara liberar o acesso, faça seu primeiro depósito (a partir de R$ ' + ((appLimits.minDeposit || 20).toFixed(2)) + ') ou ative um drone. Quem ainda não é operador pode falar com a gente pelo chat do app na opção "Falar com suporte".');
  return false;
}
const OPERATORS_GROUP_URL = 'https://SEU_GRUPO_TELEGRAM';
function openOperatorsGroup(e) {
  if (e) e.preventDefault();
  if (isCommunityMember()) { window.open(OPERATORS_GROUP_URL, '_blank'); return false; }
  alert(communityGateMessage('do Telegram'));
  return false;
}


// Menu flutuante de suporte (grupo + atendimento)
function toggleSupportMenu(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('support-menu');
  if (!m) return;
  m.style.display = (m.style.display === 'block') ? 'none' : 'block';
}
document.addEventListener('click', () => { const m = document.getElementById('support-menu'); if (m) m.style.display = 'none'; });
