// Graficos em SVG puro, sem Chart.js.
// Motivo: o admin hoje nao tem nenhuma lib de grafico e nao quero introduzir
// CDN (o helmet roda com CSP desligado - ver server.js:32 - entao cada script
// externo e uma superficie nova). SVG nativo cobre linha e barra e nao pesa.
//
// Formato de dado (espelhando services/reports.js):
//   { date: 'YYYY-MM-DD', <campo numerico> }

const TRUCKAUTO_REPORTS = (() => {

  const fmtBRL = (v) => {
    const n = parseFloat(v);
    if (!isFinite(n)) return 'R$ 0,00';
    return 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtBRLShort = (v) => {
    const n = Math.abs(parseFloat(v) || 0);
    if (n >= 1000000) return (n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
    if (n >= 1000) return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : iso;
  };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Escapa o nome do gateway: vem de query string, nao de variavel confiavel.
  const safeId = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');

  // ---------- grafico de linha (com area) ----------
  function lineChart(rows, field, opts) {
    const o = opts || {};
    const W = 720, H = o.height || 190, PAD = { t: 12, r: 12, b: 22, l: 46 };
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

    if (!rows || !rows.length) return '<div class="rep-empty">Sem dados na janela.</div>';

    const values = rows.map(r => Math.abs(parseFloat(r[field]) || 0));
    const realMax = Math.max.apply(null, values);
    if (realMax <= 0) return '<div class="rep-empty">Nenhum movimento de "' + esc(field) + '" no periodo.</div>';

    const scale = robustScale(values);
    const max = scale.max;

    const n = rows.length;
    const x = (i) => PAD.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
    const y = (v) => PAD.t + ih - (ih * v) / max;

    let path = '', area = '';
    rows.forEach((r, i) => {
      const v = Math.abs(parseFloat(r[field]) || 0);
      const cv = v > max ? max : v;
      const px = x(i), py = y(cv);
      path += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1);
    });
    area = path + ' L' + x(n - 1).toFixed(1) + ' ' + (PAD.t + ih) + ' L' + x(PAD.l).toFixed(1) + ' ' + (PAD.t + ih) + ' Z';

    const color = o.color || 'var(--accent-lime)';
    const gid = 'g' + safeId(field) + (o.suffix || '');

    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const gy = PAD.t + (ih * i) / 3;
      const gv = max - (max * i) / 3;
      grid += '<line x1="' + PAD.l + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PAD.r) + '" y2="' + gy.toFixed(1) +
        '" stroke="rgba(148,163,184,.12)" stroke-width="1"/>' +
        '<text x="' + (PAD.l - 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#94a3b8">' +
        esc(fmtBRLShort(gv)) + '</text>';
    }

    // Rotula no maximo 6 datas para o eixo nao virar sopa de letra.
    let xlabels = '';
    const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) {
      xlabels += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="#94a3b8">' +
        esc(fmtDate(rows[i].date)) + '</text>';
    }

    // Marcador no ponto que estourou o eixo, para o outlier nao sumir calado.
    let markers = '';
    if (scale.clipped) {
      rows.forEach((r, i) => {
        const v = Math.abs(parseFloat(r[field]) || 0);
        if (v <= max) return;
        markers += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(max).toFixed(1) +
          '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2"><title>' +
          esc(fmtDate(r.date) + ': ' + fmtBRL(v) + ' (acima do eixo)') + '</title></circle>';
      });
    }

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="rep-chart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
      esc(o.label || field) + ' ao longo do tempo">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      markers + xlabels +
      '</svg>' +
      (scale.clipped
        ? '<div class="rep-clip-note"><i class="fa-solid fa-arrows-up-down"></i> Eixo cortado em ' +
          esc(fmtBRL(max)) + '. Um dia acima disso foi marcado com um ponto — pico real de ' +
          esc(fmtBRL(scale.outliers[scale.outliers.length - 1])) + '.</div>'
        : '');
  }

  // ---------- graficos de barras empilhadas ----------
  // Escala robusta: um unico dia de saque massivo (usuario esvaziando a carteira)
  // achataria todas as barras normais contra o teto e esconderia a variacao
  // diaria - que e justamente o que o relatorio existe para mostrar.
  // Entao cortamos o eixo num percentil e sinalizamos o outlier explicitamente.
  function robustScale(values, opts) {
    const o = opts || {};
    const v = values.filter(x => isFinite(x) && x >= 0).sort((a, b) => a - b);
    if (!v.length) return { max: 0, clipped: false, outliers: [] };

    const realMax = v[v.length - 1];
    const idx = Math.min(v.length - 1, Math.floor(v.length * (o.percentile || 0.95)));
    const pMax = v[idx];

    // So recorta se o outlier for relevante (>= 1.8x o p95). Corte
    // conservador demais distorce a leitura de todo dia normal.
    if (realMax > pMax * 1.8 && pMax > 0) {
      const limit = pMax * 1.15;
      return {
        max: limit,
        clipped: true,
        outliers: v.filter(x => x > limit)
      };
    }
    return { max: realMax, clipped: false, outliers: [] };
  }

  function barChart(rows, fields) {
    const W = 720, H = 200, PAD = { t: 12, r: 12, b: 22, l: 46 };
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    if (!rows || !rows.length) return '<div class="rep-empty">Sem dados na janela.</div>';

    const n = rows.length;
    const totals = rows.map(r => fields.reduce((a, f) => a + Math.abs(parseFloat(r[f.key]) || 0), 0));
    const realMax = Math.max.apply(null, totals);
    if (realMax <= 0) return '<div class="rep-empty">Nenhum movimento no periodo.</div>';

    const scale = robustScale(totals);
    const max = scale.max;
    const bw = Math.max(2, (iw / n) * 0.68);

    let bars = '';
    rows.forEach((r, i) => {
      const slot = iw / n;
      const cx = PAD.l + slot * i + (slot - bw) / 2;
      let acc = PAD.t + ih;
      fields.forEach((f, fi) => {
        const v = Math.abs(parseFloat(r[f.key]) || 0);
        if (v <= 0) return;
        // Barra estoura o topo: desenhamos ate o teto e marcamos com tracejado.
        const over = v > max;
        const shown = over ? max : v;
        const h = Math.max(1, (ih * shown) / max);
        acc -= h;
        bars += '<rect x="' + cx.toFixed(1) + '" y="' + acc.toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + h.toFixed(1) + '" fill="' + f.color + '" rx="1"' +
          (over ? ' stroke="#fff" stroke-width="1" stroke-dasharray="2 2"' : '') +
          ' opacity="' + (0.5 + fi * 0.22).toFixed(2) + '"><title>' +
          esc(fmtDate(r.date) + ': ' + f.label + ' ' + fmtBRL(v) + (over ? ' (acima do eixo)' : '')) +
          '</title></rect>';
      });
    });

    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const gy = PAD.t + (ih * i) / 3;
      grid += '<line x1="' + PAD.l + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PAD.r) + '" y2="' + gy.toFixed(1) +
        '" stroke="rgba(148,163,184,.12)"/>' +
        '<text x="' + (PAD.l - 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#94a3b8">' +
        esc(fmtBRLShort(max - (max * i) / 3)) + '</text>';
    }

    let xlabels = '';
    const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) {
      xlabels += '<text x="' + (PAD.l + (iw / n) * (i + 0.5)).toFixed(1) + '" y="' + (H - 6) +
        '" text-anchor="middle" font-size="9" fill="#94a3b8">' + esc(fmtDate(rows[i].date)) + '</text>';
    }

    const legend = fields.map(f =>
      '<span class="rep-legend-item"><i style="background:' + f.color + '"></i>' + esc(f.label) + '</span>'
    ).join('');

    let clipNote = '';
    if (scale.clipped) {
      const biggest = scale.outliers[scale.outliers.length - 1];
      clipNote = '<div class="rep-clip-note"><i class="fa-solid fa-arrows-up-down"></i> Escala cortada em ' +
        esc(fmtBRL(max)) + ' para o dia a dia ficar legível. ' +
        (scale.outliers.length === 1
          ? 'Um dia passou disso: <strong>' + esc(fmtBRL(biggest)) + '</strong> (barra tracejada).'
          : scale.outliers.length + ' dias passaram disso (barras tracejadas).') +
        '</div>';
    }

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="rep-chart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Entradas e saidas por dia">' +
      grid + bars + xlabels + '</svg><div class="rep-legend">' + legend + '</div>' + clipNote;
  }

  // ---------- card ----------
  function card(label, value, sub, tone) {
    const c = tone === 'bad' ? 'red' : tone === 'warn' ? 'gold' : tone === 'good' ? 'lime' : '';
    return '<div class="metric-card rep-card' + (c ? ' rep-' + c : '') + '">' +
      '<span class="metric-label">' + esc(label) + '</span>' +
      '<div class="metric-val ' + c + '">' + value + '</div>' +
      (sub ? '<div class="rep-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function moneyCard(label, value, sub) {
    return card(label, esc(fmtBRL(value)), sub);
  }

  // ---------- painel principal: o gap ----------
  function renderGap(data) {
    const L = data.liability || {};
    const gw = data.gateway || {};
    const proj = data.projection || {};

    // Sem leitura de saldo: mostra a obrigacao e explica por que nao compara.
    if (!L.hasGatewayBalance) {
      return '<div class="rep-gap rep-gap-unknown">' +
        '<div class="rep-gap-head"><i class="fa-solid fa-circle-question"></i> Gap de caixa indisponivel</div>' +
        '<div class="rep-gap-main">Obrigacao sacavel: <strong>' + esc(fmtBRL(L.withdrawable)) + '</strong></div>' +
        '<div class="rep-gap-msg">Nao foi possivel ler o saldo real da gateway' +
        (gw.error ? ': <em>' + esc(gw.error) + '</em>' : '') +
        '. O relatorio mostra tendencia, mas naoProjecta quebra sem esse numero.</div>' +
        '</div>';
    }

    const ok = L.covered === true;
    const cls = ok ? 'rep-gap-ok' : 'rep-gap-bad';
    const pct = L.coverageRatio != null ? Math.round(L.coverageRatio * 100) : null;

    let msg = '';
    if (ok) {
      msg = 'O caixa cobre a obrigacao com folga de ' + esc(fmtBRL(Math.abs(L.gap || 0))) + '.';
      if (proj.reliable && proj.direction === 'burning' && proj.daysToBreakeven != null) {
        msg += ' Esoa: no ritmo atual de <strong>-' + esc(fmtBRL(Math.abs(proj.dailyNet))) +
          '/dia</strong>, o caixa cruza a obrigacao em <strong>' + proj.daysToBreakeven + ' dias</strong>.';
      }
    } else {
      msg = '<strong>Faltam ' + esc(fmtBRL(Math.abs(L.gap || 0))) + '</strong> para cobrir o que voce deve. ' +
        'Se alguem sacar agora, a gateway nao tem saldo para todo mundo.';
    }

    return '<div class="rep-gap ' + cls + '">' +
      '<div class="rep-gap-head"><i class="fa-solid ' + (ok ? 'fa-shield-halved' : 'fa-triangle-exclamation') + '"></i> ' +
      (ok ? 'Caixa cobre a obrigacao' : 'Caixa NAO cobre a obrigacao') + '</div>' +
      '<div class="rep-gap-grid">' +
      '<div><span>Caixa na gateway</span><strong>' + esc(fmtBRL(L.gatewayBalance)) + '</strong></div>' +
      '<div><span>Obrigacao sacavel</span><strong>' + esc(fmtBRL(L.withdrawable)) + '</strong></div>' +
      '<div><span>' + (ok ? 'Folga' : 'Buraco') + '</span><strong class="' + (ok ? 'rep-good-text' : 'rep-bad-text') + '">' +
      esc(fmtBRL(L.gap || 0)) + '</strong></div>' +
      (pct != null ? '<div><span>Cobertura</span><strong>' + pct + '%</strong></div>' : '') +
      '</div>' +
      '<div class="rep-gap-msg">' + msg + '</div>' +
      '</div>';
  }

  // ---------- painel de projecao ----------
  function renderProjection(data) {
    const p = data.projection || {};
    const su = p.sufficiency || {};

    if (!p.reliable) {
      return '<div class="panel-card"><div class="panel-head">' +
        '<h2><i class="fa-solid fa-chart-line" style="color:var(--accent-purple)"></i> Projecao de caixa</h2></div>' +
        '<div class="rep-proj-off">' +
        '<i class="fa-solid fa-lock"></i>' +
        '<div><strong>Projecao desativada</strong>' +
        '<p>' + esc(p.warning || su.message || 'Historico insuficiente.') + '</p>' +
        '<p class="rep-dim">Sem movimento suficiente para projetar. Ela usa a mediana do net diario, ' +
        'e ignora o dia corrente (que ainda esta em andamento e sempre aparece menor).</p></div>' +
        '</div></div>';
    }

    // Direcao ("esta crescendo") e confianca ("da para confiar") sao perguntas
    // diferentes. Com 6 dias de historico a projecao roda, mas declara que e fraca.
    const confMap = {
      high: { label: 'Confianca alta', color: 'var(--accent-green)' },
      medium: { label: 'Confianca media', color: 'var(--accent-gold)' },
      low: { label: 'Confianca baixa', color: 'var(--accent-gold)' },
      insufficient: { label: 'Sem historico', color: 'var(--accent-red)' }
    };
    const cm = confMap[su.level] || confMap.insufficient;
    const dirColor = p.direction === 'burning' ? 'var(--accent-red)'
      : p.direction === 'growing' ? 'var(--accent-green)' : 'var(--accent-gold)';
let verdict = '<p>O caixa vem <strong>crescendo</strong> ' + esc(fmtBRL(Math.abs(p.dailyNet))) +
      '/dia. Sem projecao de ruptura no horizonte.</p>';
    if (p.direction === 'burning' && p.breakevenDate) {
      verdict = '<p class="rep-bad-text"><strong>Ruptura projetada para ' + esc(fmtDate(p.breakevenDate)) + '</strong> (' +
        p.daysToBreakeven + ' dias). Mediana do net diario: <strong>-' + esc(fmtBRL(Math.abs(p.dailyNet))) + '</strong>.</p>';
    } else if (p.direction === 'burning') {
      verdict = '<p>Queimando ' + esc(fmtBRL(Math.abs(p.dailyNet))) +
        '/dia, mas o caixa atual cobre os ' + p.horizonDays + ' dias de horizonte.</p>';
    }
    // O caso traiçoeiro: caixa subindo, mas obrigacao subindo mais rapido.
    // A direcao diz "crescendo" e estaria certa sobre o caixa - e errada
    // sobre o risco. E aqui que mora a falencia silenciosa.
    if (p.gapDailyDelta != null && p.gapDailyDelta < 0 && p.withdrawableNow != null) {
      verdict += '<p class="rep-warn-text"><i class="fa-solid fa-triangle-exclamation"></i> ' +
        'Mas a obrigacao cresce <strong>' + esc(fmtBRL(p.dailyObligation || 0)) + '/dia</strong> ' +
        'contra ' + esc(fmtBRL(p.dailyNet)) + '/dia de caixa: o buraco aumenta ' +
        '<strong>' + esc(fmtBRL(Math.abs(p.gapDailyDelta))) + '/dia</strong> mesmo com o caixa subindo.</p>';
    }

    return '<div class="panel-card"><div class="panel-head">' +
      '<h2><i class="fa-solid fa-chart-line" style="color:var(--accent-purple)"></i> Projecao de caixa</h2>' +
      '<span class="rep-badge" style="color:' + cm.color + ';border-color:' + cm.color + '">' +
      esc(cm.label) + '</span></div>' +
      verdict +
      lineChart(p.series || [], 'projected', { color: dirColor, label: 'Caixa projetado', suffix: 'proj' }) +
      (p.pendingWithdrawals > 0
        ? '<div class="rep-caveat"><i class="fa-solid fa-circle-info"></i><span>Ja descontando ' +
          esc(fmtBRL(p.pendingWithdrawals)) + ' de saques na fila - esse dinheiro sai no curto prazo.</span></div>'
        : '') +
      (su.volatile
        ? '<div class="rep-caveat"><i class="fa-solid fa-triangle-exclamation"></i><span>O dia a dia ' +
          'oscila muito - um pico isolado move a linha inteira.</span></div>'
        : '') +
      '<div class="rep-note">Base: <strong>' + esc(String(su.daysWithData || 0)) +
      ' dias</strong> de movimento. ' + esc(su.message || '') + '</div>' +
      '</div>';
  }

  // ---------- concentracao ----------
  function renderConcentration(data) {
    const c = data.concentration || {};
    const pct = Math.round((c.top5Share || 0) * 100);
    const tone = c.concentrated ? 'bad' : (c.top5Share > 0.3 ? 'warn' : 'good');

    let msg;
    if (c.concentrated) {
      msg = '<div class="rep-warn-box"><i class="fa-solid fa-triangle-exclamation"></i> ' +
        '<strong>Base concentrada.</strong> ' + pct + '% do saldo esta em 5 maos. Se uma delas desistir, ' +
        'a plataforma perde esse valor e a receita recorrente junto.</div>';
    } else if (!c.holders) {
      msg = '<div class="rep-dim">Nenhum usuario com saldo positivo.</div>';
    } else {
      msg = '<div class="rep-ok-box"><i class="fa-solid fa-circle-check"></i> Base distribuida: ' +
        pct + '% do saldo nos 5 maiores, de ' + c.holders + ' holders.</div>';
    }

    let rows = '';
    (c.top || []).forEach((u, i) => {
      const share = c.total > 0 ? Math.round((u.balance / c.total) * 1000) / 10 : 0;
      rows += '<tr><td>' + (i + 1) + '</td><td>R$ ' + esc(fmtBRL(u.balance)) + '</td>' +
        '<td><div class="rep-bar"><i style="width:' + Math.min(100, share) + '%"></i></div>' +
        '<span class="rep-bar-val">' + esc(String(share)) + '%</span></td></tr>';
    });

    return '<div class="panel-card"><div class="panel-head">' +
      '<h2><i class="fa-solid fa-users-viewfinder" style="color:var(--accent-gold)"></i> Concentracao da base</h2></div>' +
      msg +
      (rows ? '<div class="table-responsive" style="margin-top:14px"><table class="custom-table">' +
        '<thead><tr><th>#</th><th>Saldo</th><th>% do total</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
      '</div>';
  }

  // ---------- holders ----------
  function renderHolders(data) {
    const rows = data.rows || [];
    if (!rows.length) return '<div class="rep-empty">Nenhum usuario com saldo.</div>';
    return '<div class="table-responsive"><table class="custom-table"><thead><tr>' +
      '<th>Operador</th><th>Telefone</th><th>Saldo</th><th>Investido</th><th>Ganho</th>' +
      '<th>Total depositado</th><th>Ja sacou</th><th>% da base</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + esc(r.operatorName) + '</td>' +
        '<td>' + esc(r.phone || '-') + '</td>' +
        '<td><strong>' + esc(fmtBRL(r.balance)) + '</strong></td>' +
        '<td>' + esc(fmtBRL(r.investBalance)) + '</td>' +
        '<td>' + esc(fmtBRL(r.earnBalance)) + '</td>' +
        '<td>' + esc(fmtBRL(r.totalDeposited)) + '</td>' +
        '<td>' + esc(fmtBRL(r.totalWithdrawn)) + '</td>' +
        '<td>' + esc((r.share * 100).toFixed(2)) + '%</td></tr>').join('') +
      '</tbody></table></div>';
  }

  // ---------- orquestracao ----------
  async function loadReports() {
    const days = Number(document.getElementById('rep-days').value) || 30;
    const gateway = document.getElementById('rep-gateway').value;
    const holderBox = document.getElementById('rep-holders');
    const body = document.getElementById('rep-body');

    body.innerHTML = '<div class="rep-loading"><i class="fa-solid fa-spinner fa-spin"></i> Montando relatorio...</div>';

    try {
      const res = await adminFetch(`/reports/overview?days=${days}&gateway=${encodeURIComponent(gateway)}`);
      if (!res) throw new Error('sem resposta');

      const L = res.liability || {};
      const T = res.totals || {};
      const pend = res.pendingWithdrawals || {};

      const gapTone = res.health === 'critical' ? 'bad' : res.health === 'warning' ? 'warn' : 'good';

      const cards = [
        moneyCard('Entradas na janela', T.deposits, days + ' dias'),
        moneyCard('Saques na janela', T.withdrawals, 'aprovados'),
        moneyCard('Resultado do periodo', T.net, T.net >= 0 ? 'entradas &gt; saidas' : 'saidas &gt; entradas',
          T.net >= 0 ? 'good' : 'bad'),
        card('Saque pendente', esc(fmtBRL(pend.amount)),
          pend.count + (pend.count === 1 ? ' aguardando' : ' aguardando') + ' envio',
          pend.amount > 0 ? 'warn' : 'good'),
        moneyCard('Obrigacao total', L.withdrawable, 'earn + pendentes', gapTone === 'bad' ? 'bad' : '')
      ].join('');

      body.innerHTML =
        '<div class="rep-card-row">' + cards + '</div>' +
        renderGap(res) +
        '<div class="panel-card"><div class="panel-head">' +
        '<h2><i class="fa-solid fa-arrow-right-arrow-left" style="color:var(--accent-green)"></i> Entradas e saidas por dia</h2>' +
        '<span class="rep-dim">inclui o dia corrente, ainda em andamento</span></div>' +
        barChart(res.dailySeries, [
          { key: 'deposits', label: 'Entradas', color: 'var(--accent-green)' },
          { key: 'withdrawals', label: 'Saques', color: 'var(--accent-red)' }
        ]) +
        '<div class="rep-split">' +
        '<div><span class="rep-split-t">Entradas por dia</span>' +
        lineChart(res.dailySeries, 'deposits', { color: 'var(--accent-green)', label: 'Entradas por dia' }) + '</div>' +
        '<div><span class="rep-split-t">Saques por dia</span>' +
        lineChart(res.dailySeries, 'withdrawals', { color: 'var(--accent-red)', label: 'Saques por dia', height: 150 }) + '</div>' +
        '</div></div>' +
        renderProjection(res) +
        renderConcentration(res);

      const hres = await adminFetch('/reports/holders?limit=25');
      if (holderBox) {
        holderBox.innerHTML = hres
          ? renderHolders(hres)
          : '<div class="rep-empty">Nao foi possivel carregar os holders.</div>';
      }
    } catch (err) {
      console.error('[REPORTS ERROR]', err);
      body.innerHTML = '<div class="rep-error"><i class="fa-solid fa-triangle-exclamation"></i> ' +
        'Erro ao carregar o relatorio. Verifique o console do servidor.</div>';
    }
  }

  return { loadReports, fmtBRL, lineChart, barChart };
})();
