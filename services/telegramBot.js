require('dotenv').config();
const { Bot, InlineKeyboardBuilder } = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const groupChatId = process.env.TELEGRAM_CHAT_ID || '';
const appUrl = process.env.APP_URL || '';

let bot = null;
const adminChatIds = new Set();
if (process.env.ADMIN_TELEGRAM_CHAT_ID) {
  adminChatIds.add(process.env.ADMIN_TELEGRAM_CHAT_ID);
}


function initTelegramBot() {
  if (!token || token.trim() === '') {
    console.log('[TELEGRAM BOT] TELEGRAM_BOT_TOKEN nao configurado. Bot em modo de espera.');
    return null;
  }

  try {
    bot = new Bot(token);

    // Tratamento de erros do bot
    bot.catch((err) => {
      console.error('[TELEGRAM BOT ERROR]:', err.message || err);
    });

    // Comando /start
    bot.command('start', async (ctx) => {
      const firstName = ctx.from && ctx.from.first_name ? ctx.from.first_name : 'Operador';

      const welcomeText = 
        '🚀 *BEM-VINDO AO TRUCKAUTO* 🤖\n\n' +
        'Olá, *' + firstName + '*! Você está no canal oficial de frotas autônomas urbanas.\n\n' +
        '💡 *Como funciona?*\n' +
        '1️⃣ Cadastre-se na plataforma.\n' +
        '2️⃣ Escolha uma das 8 frotas de caminhões autônomos (Urbano, Titan, Apex, etc).\n' +
        '3️⃣ Receba liquidação diária de rendimentos direto na sua carteira com saque via Pix!\n\n' +
        '👥 *Indique e Ganhe:* Comissões em 3 níveis (10%, 5% e 2%) sobre qualquer contrato da sua rede!';

      await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Acessar Aplicativo TRUCKAUTO', url: appUrl + '/' }],
            [
              { text: '🚗 Frotas & Veículos', callback_data: 'cmd_frotas' },
              { text: '💸 Regras de Saque', callback_data: 'cmd_saques' }
            ],
            [{ text: '👥 Grupo VIP no Telegram', url: appUrl || '' }]
          ]
        }
      });
    });

    // Comando /frotas
    bot.command('frotas', async (ctx) => {
      await sendFleetMessage(ctx);
    });

    // Comando /regras ou /saques
    bot.command(['regras', 'saques'], async (ctx) => {
      await sendRulesMessage(ctx);
    });

    // Comando /postar (Dispara um post aleatório imediato com mídia)
    bot.command('postar', async (ctx) => {
      await triggerRandomPost(ctx.chat.id);
    });

    // Comando /admin (Registra o Telegram do dono para receber alertas de saque)
    bot.command(['admin', 'alerta', 'notificacoes'], async (ctx) => {
      adminChatIds.add(String(ctx.chat.id));
      await ctx.reply(
        '👑 *MODO ADMINISTRADOR ATIVADO!*\n\n' +
        'Seu Telegram foi registrado com sucesso. Você receberá notificações instantâneas aqui no privado sempre que qualquer cliente solicitar um saque Pix.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🖥️ Acessar Painel de Controle', url: appUrl + '/admin.html' }]
            ]
          }
        }
      );
    });


    // Resposta a cliques em botões (callbacks)
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      if (data === 'cmd_frotas') {
        await sendFleetMessage(ctx);
      } else if (data === 'cmd_saques') {
        await sendRulesMessage(ctx);
      }

      await ctx.answerCallbackQuery();
    });

    // Boas-Vindas a Novos Membros do Grupo
    bot.on('message:new_chat_members', async (ctx) => {
      const newMembers = ctx.message.new_chat_members || [];

      for (const member of newMembers) {
        if (member.is_bot) continue;

        const name = member.first_name || 'Operador';
        const msgText = 
          '👋 *BEM-VINDO À COMUNIDADE TRUCKAUTO, ' + name + '!* 🚀\n\n' +
          'Você acaba de entrar no grupo oficial de operadores de frotas autônomas.\n\n' +
          '⚡ *Passo 1:* Acesse o app e crie sua conta.\n' +
          '⚡ *Passo 2:* Faça seu check-in diário e ative seu veículo de alta performance.\n' +
          '⚡ *Passo 3:* Acompanhe os avisos e comprovantes de rendimento aqui no grupo!';

        await ctx.reply(msgText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Acessar App TRUCKAUTO', url: appUrl + '/login.html' }]
            ]
          }
        });
      }
    });

    // Auto-detecção do Grupo ao receber qualquer mensagem
    bot.on('message', (ctx) => {
      if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        console.log(`[TELEGRAM] Grupo detectado! ID: ${ctx.chat.id} | Título: ${ctx.chat.title}`);
      }
    });


    // Inicia escuta
    bot.startPolling();
    console.log('[TELEGRAM BOT] Bot @truckauto_oficial_bot escutando mensagens em tempo real!');

  } catch (err) {
    console.error('[TELEGRAM BOT INIT ERROR]:', err);
  }

  return bot;
}

async function sendFleetMessage(ctx) {
  const text = 
    '⚡ *CATÁLOGO DE FROTAS AUTÔNOMAS TRUCKAUTO* ⚡\n\n' +
    '0️⃣ *TruckAuto Urbano (NX-030)*\n' +
    '• Contrato: R$ 30,00 | Retorno: *R$ 3,80/dia* (15 dias)\n\n' +
    '1️⃣ *TruckAuto Volta (NX-101)*\n' +
    '• Contrato: R$ 150,00 | Retorno: *R$ 11,20/dia* (30 dias)\n\n' +
    '2️⃣ *TruckAuto Strada (NX-202)*\n' +
    '• Contrato: R$ 350,00 | Retorno: *R$ 30,00/dia* (30 dias)\n\n' +
    '3️⃣ *TruckAuto Aurora (NX-707)*\n' +
    '• Contrato: R$ 600,00 | Retorno: *R$ 68,00/dia* (40 dias)\n\n' +
    '4️⃣ *TruckAuto Tornado (NX-404)*\n' +
    '• Contrato: R$ 900,00 | Retorno: *R$ 75,00/dia* (45 dias)\n\n' +
    '5️⃣ *TruckAuto Atlas (NX-303)*\n' +
    '• Contrato: R$ 1.500,00 | Retorno: *R$ 150,00/dia* (45 dias)\n\n' +
    '6️⃣ *TruckAuto Titan (NX-505)*\n' +
    '• Contrato: R$ 2.800,00 | Retorno: *R$ 150,00/dia* (60 dias)\n\n' +
    '7️⃣ *TruckAuto Apex (NX-606)*\n' +
    '• Contrato: R$ 5.000,00 | Retorno: *R$ 250,00/dia* (60 dias)';

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚗 Contratar Frota no App', url: appUrl + '/' }]
      ]
    }
  });
}

async function sendRulesMessage(ctx) {
  const saqueText = 
    '💳 *REGRAS DE SAQUE & LIQUIDAÇÃO PIX*\n\n' +
    '• *Valor Mínimo de Saque:* R$ 30,00\n' +
    '• *Forma de Pagamento:* Pix Instantâneo (Chave CPF, Telefone, Email ou Aleatória)\n' +
    '• *Horário de Processamento:* Segunda a Domingo\n' +
    '• *Rendimentos:* Liquidados diariamente de forma 100% automática!\n\n' +
    '👥 *Comissões de Rede:*\n' +
    '• Nível 1: 10% de bônus imediato\n' +
    '• Nível 2: 5% de bônus\n' +
    '• Nível 3: 2% de bônus';

  await ctx.reply(saqueText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Ir para Área de Saque', url: appUrl + '/' }]
      ]
    }
  });
}

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

/**
 * Envia mensagem com Foto, Vídeo ou Texto via Telegram API nativo
 */
async function sendBroadcastWithMedia(targetChatId, folderName, caption, inlineKeyboard) {
  if (!token || !targetChatId) return;

  const mediaDir = path.join(__dirname, '..', 'media', folderName);
  let mediaFile = null;

  try {
    if (fs.existsSync(mediaDir)) {
      const files = fs.readdirSync(mediaDir).filter(f => /\.(jpg|jpeg|png|mp4)$/i.test(f));
      if (files.length > 0) {
        const randomName = files[Math.floor(Math.random() * files.length)];
        mediaFile = path.join(mediaDir, randomName);
      }
    }
  } catch (err) {
    console.error(`[MEDIA SEARCH ERROR in ${folderName}]:`, err.message);
  }

  const replyMarkupStr = inlineKeyboard ? JSON.stringify({ inline_keyboard: inlineKeyboard }) : null;

  try {
    if (mediaFile) {
      const isVideo = /\.mp4$/i.test(mediaFile);
      const fileBuffer = fs.readFileSync(mediaFile);
      const formData = new FormData();

      formData.append('chat_id', targetChatId);
      formData.append('caption', caption);
      formData.append('parse_mode', 'Markdown');
      if (replyMarkupStr) formData.append('reply_markup', replyMarkupStr);

      if (isVideo) {
        formData.append('video', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(mediaFile));
        console.log(`[TELEGRAM MEDIA] Enviando vídeo (${path.basename(mediaFile)}) para o grupo...`);
        const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'Erro ao enviar video');
      } else {
        const ext = path.extname(mediaFile).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        formData.append('photo', new Blob([fileBuffer], { type: mimeType }), path.basename(mediaFile));
        console.log(`[TELEGRAM MEDIA] Enviando foto (${path.basename(mediaFile)}) para o grupo...`);
        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'Erro ao enviar foto');
      }
    } else {
      console.log(`[TELEGRAM TEXT] Enviando mensagem de texto para o grupo...`);
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: caption,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || 'Erro ao enviar mensagem');
    }
  } catch (err) {
    console.error(`[BROADCAST SEND ERROR]:`, err.message);
    // Fallback: tenta enviar só texto
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: caption,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined
        })
      });
    } catch (e) {
      console.error(`[BROADCAST FALLBACK ERROR]:`, e.message);
    }
  }
}

// Lista de Cópias Dinâmicas de Alta Conversão
const dynamicTemplates = [
  {
    caption: 
      '🚀 *DO REGIME PARCIAL AO NÍVEL EXECUTIVO* 💸\n\n' +
      'Começar no regime parcial com frotas de entrada (NX-030 ou NX-101) é o primeiro passo de todo grande operador no TRUCKAUTO.\n\n' +
      'Mais de 40 operadores tiveram seus contratos atualizados para níveis superiores de alta demanda, desbloqueando rendimentos diários de até R$ 720,00 direto na carteira Pix!\n\n' +
      '🔑 *O SEGREDO DA ESCALA NO TRUCKAUTO:*\n' +
      '• Comece com a frota que cabe no seu bolso.\n' +
      '• Mantenha seu check-in diário ativo.\n' +
      '• Reinvista seus rendimentos para subir de nível e faturar no automático.\n\n' +
      'As frotas de Kansas City e Los Angeles já estão nas ruas rodando por você.\n\n' +
      '📱 *Acesse seu painel e ative seu veículo agora:*',
    buttons: [
      [{ text: '🚗 Ativar Minha Frota Agora', url: appUrl + '/' }],
      [{ text: '📱 Fazer Check-in Diário', url: appUrl + '/' }]
    ]
  },
  {
    caption: 
      '💸 *[RELATÓRIO DE OPERAÇÃO] RENDIMENTOS DE TURNO CREDITADOS!* 🚗⚡\n\n' +
      'O ciclo de viagens das frotas autônomas em Memphis acaba de ser finalizado e os lucros já foram creditados na carteira dos operadores!\n\n' +
      '📊 *DESEMPENHO DO TURNO:*\n' +
      '• TruckAuto Volta (NX-101): Viagens urbanas concluídas\n' +
      '• TruckAuto Aurora (NX-707): Operação em alta demanda (+18% de eficiência)\n' +
      '• TruckAuto Atlas (NX-303): Rotas executivas finalizadas\n\n' +
      'Seu rendimento de hoje já está disponível para saque ou para reinvestir na subida de nível.\n\n' +
      '📲 *Abra seu painel e veja seu saldo crescendo:*',
    buttons: [
      [{ text: '💰 Ver Meu Saldo no App', url: appUrl + '/' }],
      [{ text: '🚗 Ver Frotas Disponíveis', url: appUrl + '/' }]
    ]
  },
  {
    caption: 
      '⚡ *[LOTE DE SAQUES PIX APROVADO] DINHEIRO NA CONTA DOS OPERADORES!* 💳💸\n\n' +
      'Mais um lote de solicitações de saque foi processado e enviado via Pix direto para as contas bancárias dos operadores ativos!\n\n' +
      '🏆 *O TRUCKAUTO NÃO PARA:*\n' +
      '• Saques a partir de R$ 30,00\n' +
      '• Liquidação instantânea via Pix\n' +
      '• Sem taxas abusivas ou burocracia\n\n' +
      'Trabalho autônomo com tecnologia de verdade: o robô roda nas ruas e o lucro cai na sua conta todos os dias.\n\n' +
      'Parabéns a todos os operadores que já garantiram o seu Pix de hoje! 🚀\n\n' +
      '📱 *Solicite seu saque ou ative sua frota no app:*',
    buttons: [
      [{ text: '💳 Solicitar Saque Pix', url: appUrl + '/' }],
      [{ text: '📱 Acessar Plataforma', url: appUrl + '/' }]
    ]
  },
  {
    caption: 
      '🌙 *[FECHAMENTO DE CICLO] ÚLTIMAS VAGAS DE FROTAS PARA AMANHÃ!* 🚗⏳\n\n' +
      'O ciclo operacional de hoje está se encerrando com mais de 98% das frotas em operação contínua.\n\n' +
      '🚨 *ATENÇÃO:* As vagas para contratação das categorias de maior rendimento estão se esgotando:\n' +
      '🔥 TruckAuto Aurora (NX-707) ➔ Restam poucas unidades\n' +
      '👑 TruckAuto Apex (NX-606) ➔ Última cota disponível para o turno da manhã\n\n' +
      'Quem ativa o contrato ainda hoje já acorda com os primeiros rendimentos sendo contabilizados no ciclo de amanhã cedo!\n\n' +
      'Não durma no ponto enquanto a inteligência artificial trabalha por você.\n\n' +
      '👉 *ATIVE SUA FROTA AGORA:*',
    buttons: [
      [{ text: '🚗 Garantir Minha Frota Agora', url: appUrl + '/' }]
    ]
  },
  {
    caption: 
      '🎁 *[BÔNUS DIÁRIO LIBERADO] RESGATE SEU CHECK-IN NO APP!* ⚡\n\n' +
      'Operadores ativos já podem acessar o aplicativo e resgatar o bônus de check-in diário gratuito!\n\n' +
      '💡 *Dica de Operador:* Mantenha sua sequência diária de check-in ativa para aumentar seus bônus e acelerar sua subida de nível nas frotas autônomas.\n\n' +
      '📱 *Resgate seu bônus agora:*',
    buttons: [
      [{ text: '🎁 Resgatar Bônus de Check-in', url: appUrl + '/' }],
      [{ text: '🚗 Ver Frotas Disponíveis', url: appUrl + '/' }]
    ]
  }
];

/**
 * Dispara um post aleatório com foto/vídeo da pasta 01_bom_dia
 */
async function triggerRandomPost(targetChatId) {
  const chatId = targetChatId || groupChatId || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const template = dynamicTemplates[Math.floor(Math.random() * dynamicTemplates.length)];
  console.log(`[TELEGRAM RANDOM POST] Disparando post aleatório para o grupo: ${chatId}...`);
  await sendBroadcastWithMedia(chatId, '01_bom_dia', template.caption, template.buttons);
}

// Inicia os agendamentos se o groupChatId ou TELEGRAM_CHAT_ID estiver definido
function startDailySchedule() {
  const targetChatId = groupChatId || process.env.TELEGRAM_CHAT_ID;
  if (!targetChatId) {
    console.log('[TELEGRAM SCHEDULER] Aguardando ID do grupo para iniciar agendamentos automáticos.');
    return;
  }

  console.log(`[TELEGRAM SCHEDULER] Grade de postagens automáticas com mídias ativada para o grupo: ${targetChatId}`);

  // Disparo Contínuo a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando rotação aleatória contínua (a cada 5 min)...');
    await triggerRandomPost(targetChatId);
  }, { timezone: 'America/Sao_Paulo' });


  // 1. Manhã - 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 09:00 com mídia...');
    await sendBroadcastWithMedia(targetChatId, '01_bom_dia', dynamicTemplates[0].caption, dynamicTemplates[0].buttons);
  }, { timezone: 'America/Sao_Paulo' });

  // 2. Meio-dia - 12:30
  cron.schedule('30 12 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 12:30 com mídia...');
    await sendBroadcastWithMedia(targetChatId, '01_bom_dia', dynamicTemplates[1].caption, dynamicTemplates[1].buttons);
  }, { timezone: 'America/Sao_Paulo' });

  // 3. Tarde - 16:00
  cron.schedule('0 16 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 16:00 com mídia...');
    await sendBroadcastWithMedia(targetChatId, '01_bom_dia', dynamicTemplates[2].caption, dynamicTemplates[2].buttons);
  }, { timezone: 'America/Sao_Paulo' });

  // 4. Noite - 20:00
  cron.schedule('0 20 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 20:00 com mídia...');
    await sendBroadcastWithMedia(targetChatId, '01_bom_dia', dynamicTemplates[3].caption, dynamicTemplates[3].buttons);
  }, { timezone: 'America/Sao_Paulo' });
}


// Inicia os agendamentos se o groupChatId estiver definido
if (groupChatId || process.env.TELEGRAM_CHAT_ID) {
  startDailySchedule();
}

/**
 * Dispara notificação de rendimento diário para o grupo
 */
async function broadcastDailySettlement({ settlementsProcessed, totalCredited }) {
  const targetChatId = groupChatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !targetChatId) return;

  const format = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
  const msg = 
    '🔔 *[LIQUIDAÇÃO DIÁRIA CONCLUÍDA]* 💸\n\n' +
    'O motor autônomo do TRUCKAUTO acabou de processar os rendimentos das frotas ativas!\n\n' +
    '📊 *Contratos Liquidados:* ' + settlementsProcessed + '\n' +
    '💰 *Total Creditado Hoje:* R$ ' + format(totalCredited) + '\n\n' +
    'Verifique seu saldo atualizado no aplicativo:';

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: msg,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Ver Meu Saldo no App', url: appUrl + '/' }]
          ]
        }
      })
    });
  } catch (e) {
    console.error('[TELEGRAM BROADCAST ERROR]:', e.message);
  }
}

/**
 * Envia notificação privada ao Administrador sobre novo pedido de saque Pix
 */
async function notifyAdminWithdrawal({ operatorName, phone, amount, pixKey, txId, totalDeposited = 0, activeContractsCount = 0, alreadyWithdrawn = 0, alreadyCount = 0 }) {
  if (!token) return;
  const format = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const isDepositor = totalDeposited > 0 || activeContractsCount > 0;
  const depositStatusText = isDepositor
    ? '✅ *Depósitos Confirmados:* R$ ' + format(totalDeposited) + ' (' + activeContractsCount + ' frotas ativas)'
    : '⚠️ *ALERTA:* Operador NUNCA depositou nem ativou frotas!';

  // Quanto ele já sacou de verdade (soma dos saques APROVADOS). Serve para
  // pegar quem está sacando muito, sem sujar o número com saque pendente.
  // parseFloat de lixo devolve NaN e Math.max(0, NaN) continua NaN, então
  // precisa do Number.isFinite antes -- senão vaza "NaN" na mensagem.
  const rawSacou = parseFloat(alreadyWithdrawn);
  const sacou = Number.isFinite(rawSacou) ? Math.max(0, rawSacou) : 0;
  const rawQtd = parseInt(alreadyCount, 10);
  const qtdSaques = Number.isFinite(rawQtd) ? Math.max(0, rawQtd) : 0;
  const ALERTE_SAQUE = 500;
  const plural = qtdSaques === 1 ? '' : 's';
  let saqueText;
  if (sacou <= 0) {
    saqueText = '🆕 *Já sacou antes:* R$ 0,00 (este é o primeiro)';
  } else if (sacou >= ALERTE_SAQUE) {
    saqueText = '⚠️ *Já sacou antes:* `R$ ' + format(sacou) + '` em ' + qtdSaques + ' saque' + plural + ' — **VALOR ALTO**';
  } else {
    saqueText = '💸 *Já sacou antes:* `R$ ' + format(sacou) + '` em ' + qtdSaques + ' saque' + plural;
  }

  const msg =
    '🚨 *[NOVA SOLICITAÇÃO DE SAQUE PIX]* 💸\n\n' +
    '👤 *Operador:* ' + (operatorName || 'Não identificado') + '\n' +
    '📱 *Telefone:* ' + (phone || '-') + '\n' +
    '💰 *Valor Solicitado:* `R$ ' + format(amount) + '`\n' +
    '🔑 *Chave Pix:* `' + pixKey + '`\n' +
    '📊 *Status de Depósito:* ' + depositStatusText + '\n' +
    saqueText + '\n' +
    '🆔 *Transação:* `' + txId + '`\n' +
    '⏰ *Horário:* ' + now + '\n\n' +
    (isDepositor 
      ? '👉 *Ação:* Copie a Chave Pix acima, realize a transferência no seu banco e aprove a transação no painel administrativo.'
      : '⛔ *ATENÇÃO:* Verifique a legitimidade antes de pagar qualquer valor a este usuário.');

  const targets = Array.from(adminChatIds);
  // Se nenhum admin privado estiver registrado, notifica o chat do grupo como fallback
  if (targets.length === 0 && (groupChatId || process.env.TELEGRAM_CHAT_ID)) {
    targets.push(groupChatId || process.env.TELEGRAM_CHAT_ID);
  }

  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🖥️ Abrir Painel de Saques', url: appUrl + '/admin.html' }]
            ]
          }
        })
      });
      console.log(`[TELEGRAM ADMIN NOTIFY] Alerta de saque enviado para chat ${chatId}`);
    } catch (err) {
      console.error('[ADMIN NOTIFY ERROR]:', err.message);
    }
  }
}

/**
 * Aviso de vídeo novo do Programa Social, para o admin aprovar no painel.
 * Sem botão aqui de propósito: a aprovação é manual e mora no painel, onde
 * fica o rastro de quem aprovou o quê.
 */
async function notifyAdminSocialPost({ operatorName, phone, network, handle, videoUrl }) {
  if (!token) return;
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const per = String(phone || '').trim();
  // O handle e o nome do operador vao crus para dentro do texto. Um "_" ou "*"
// desbalanceado faz o Telegram responder 400, e fetch NAO lanca em 4xx -- o
// aviso sumia em silencio e o admin nunca ficava sabendo do video (a pessoa
// escolhe o que escreve no campo do @). Escapando os tres campos que vem de
// fora, o Markdown continua valendo para a estrutura da mensagem.
const md = (s) => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/_/g, '\\_').replace(/\*/g, '\\*')
  .replace(/`/g, '\\`').replace(/\[/g, '\\[');
const msg =
    '🎥 *NOVO VÍDEO PARA APROVAR* 🎬\n\n' +
    '👤 *Operador:* ' + md(operatorName || 'Não identificado') + '\n' +
    (per ? '📱 *Telefone:* ' + md(per) + '\n' : '') +
    '🌐 *Rede:* ' + md(network || 'tiktok') + (handle ? ' — ' + md(handle) : '') + '\n' +
    '🔗 *Vídeo:* ' + md(videoUrl || '-') + '\n' +
    '⏰ *Horário:* ' + now + '\n\n' +
    '👉 *Ação:* aprove ou recuse no painel administrativo.';

  const targets = Array.from(adminChatIds);
  // Se nenhum admin privado estiver registrado, notifica o chat do grupo como fallback
  if (targets.length === 0 && (groupChatId || process.env.TELEGRAM_CHAT_ID)) {
    targets.push(groupChatId || process.env.TELEGRAM_CHAT_ID);
  }

  let enviados = 0;
  for (const chatId of targets) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
          // Sem cartao de link: o Telegram nao deve tentar renderizar o link
          // do TikTok, o admin so precisa do texto para abrir no navegador.
          disable_web_page_preview: true
        })
      });
      // fetch resolve em 4xx: so o res.ok revela a falha.
      if (!res.ok) {
        const corpo = await res.text().catch(() => '');
        console.error('[TELEGRAM SOCIAL]-recusou:', res.status, corpo.slice(0, 200));
      } else {
        enviados++;
        console.log(`[TELEGRAM SOCIAL] Video novo enviado para o admin no chat ${chatId}`);
      }
    } catch (err) {
      console.error('[TELEGRAM SOCIAL ERROR]:', err.message);
    }
  }
  if (!enviados) {
    // A fila continua la e o admin ve abrindo o painel, mas o silêncio precisa
    // ficar registrado.
    console.error('[TELEGRAM SOCIAL] NENHUM aviso entregue. O video esta na fila do painel.');
  }
}

/**
 * Envia notificação privada ao Administrador sobre novo depósito / contratação Pix confirmado
 */
async function notifyAdminDeposit({ operatorName, phone, amount, productName, txId, isAutoHire }) {
  if (!token) return;
  const format = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const msg =
    '🎉 *[PAGAMENTO PIX CONFIRMADO!]* 💸⚡\n\n' +
    '👤 *Operador:* ' + (operatorName || 'Não identificado') + '\n' +
    '📱 *Telefone:* ' + (phone || '-') + '\n' +
    '💰 *Valor Pago:* `R$ ' + format(amount) + '`\n' +
    (productName ? ('🚗 *Frota:* ' + productName + '\n') : '') +
    (isAutoHire ? '⚡ *Status:* Contrato de Frota Ativado Automaticamente!\n' : '💰 *Status:* Saldo Creditado na Carteira!\n') +
    '🆔 *Transação:* `' + (txId || '-') + '`\n' +
    '⏰ *Horário:* ' + now;

  const targets = Array.from(adminChatIds);
  if (targets.length === 0 && (groupChatId || process.env.TELEGRAM_CHAT_ID)) {
    targets.push(groupChatId || process.env.TELEGRAM_CHAT_ID);
  }

  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🖥️ Abrir Painel de Gestão', url: appUrl + '/admin.html' }]
            ]
          }
        })
      });
      console.log(`[TELEGRAM ADMIN NOTIFY] Alerta de pagamento enviado para chat ${chatId}`);
    } catch (err) {
      console.error('[ADMIN NOTIFY DEPOSIT ERROR]:', err.message);
    }
  }
}

/**
 * Avisa o Administrador sobre nova mensagem no chat de suporte
 */
async function notifyAdminSupportMessage({ operatorName, phone, text }) {
  if (!token) return;
  // Texto do usuário escapa a formatação Markdown do Telegram
  const safe = String(text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '').slice(0, 400);
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const msg =
    '💬 *[SUPORTE] Nova mensagem no app*\n\n' +
    '👤 *Operador:* ' + (operatorName || 'Não identificado') + '\n' +
    '📱 *Telefone:* ' + (phone || '-') + '\n' +
    '💭 *Mensagem:* ' + (safe || '(vazia)') + '\n' +
    '⏰ *Horário:* ' + now;

  const targets = Array.from(adminChatIds);
  if (targets.length === 0 && (groupChatId || process.env.TELEGRAM_CHAT_ID)) {
    targets.push(groupChatId || process.env.TELEGRAM_CHAT_ID);
  }

  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🖥️ Abrir Atendimento', url: appUrl + '/admin.html' }]
            ]
          }
        })
      });
      console.log(`[TELEGRAM ADMIN NOTIFY] Suporte: mensagem de ${operatorName} enviada para chat ${chatId}`);
    } catch (err) {
      console.error('[ADMIN NOTIFY SUPPORT ERROR]:', err.message);
    }
  }
}

/**
 * Alerta de segurança genérico ao Administrador (ex: tentativa de login)
 */
async function notifyAdminSecurityAlert({ title, detail }) {
  if (!token) return;
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const msg =
    '🛡️ *[ALERTA DE SEGURANÇA]*\n\n' +
    '⚠️ *' + String(title || 'Evento suspeito') + '*\n' +
    (detail ? String(detail).slice(0, 400) + '\n' : '') +
    '⏰ *Horário:* ' + now;

  const targets = Array.from(adminChatIds);
  if (targets.length === 0 && (groupChatId || process.env.TELEGRAM_CHAT_ID)) {
    targets.push(groupChatId || process.env.TELEGRAM_CHAT_ID);
  }

  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
      });
    } catch (err) {
      console.error('[ADMIN SECURITY NOTIFY ERROR]:', err.message);
    }
  }
}

module.exports = {
  notifyAdminSocialPost,
  initTelegramBot,
  broadcastDailySettlement,
  startDailySchedule,
  sendBroadcastWithMedia,
  triggerRandomPost,
  notifyAdminWithdrawal,
  notifyAdminDeposit,
  notifyAdminSupportMessage,
  notifyAdminSecurityAlert
};






