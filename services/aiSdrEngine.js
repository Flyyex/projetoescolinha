/**
 * aiSdrEngine.js
 * Motor Inteligente de Atendimento Contextual da TRUCKAUTO
 * Processa intenções complexas: Afiliados, Níveis, Comissões, Check-in, Rendimentos Diários, Saques Pix, etc.
 */

class AISDREngine {
  constructor() {
    this.appUrl = (process.env.APP_URL || '') + '/login.html';
    this.instagramUrl = '';
    this.telegramUrl = '';
  }

  normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^\w\s]/gi, ' ') // remove pontuação excessiva
      .replace(/\s+/g, ' ')
      .trim();
  }

  processMessage({ text, lead, history = [] }) {
    const raw = text || '';
    const norm = this.normalizeText(raw);
    const firstName = (lead?.name || '').split(' ')[0] || 'amigo(a)';

    let reply = null;
    let nextStage = null;
    let pauseBot = false;
    let intentName = 'unknown';

    // 1. SOLICITAÇÃO DE ATENDENTE HUMANO
    if (
      norm.includes('humano') || norm.includes('atendente') || norm.includes('pessoa') ||
      norm.includes('falar com alguem') || norm.includes('falar com uma pessoa') ||
      norm.includes('suporte humano') || norm.includes('nao quero robo') || norm.includes('chamar atendente')
    ) {
      intentName = 'human_transfer';
      pauseBot = true;
      reply = `👨‍💼 *Atendimento Humano Solicitado!*\n\nPerfeito, ${firstName}! Pausei nosso assistente automático e notifiquei a equipe de consultores.\n\nUm atendente oficial TRUCKAUTO vai assumir esta conversa em instantes para falar com você pessoalmente!`;
    }

    // 2. CHECK-IN DIÁRIO & RECOMPENSA GRÁTIS
    else if (
      norm.includes('checkin') || norm.includes('check in') || norm.includes('chekin') || norm.includes('cheking') ||
      norm.includes('bonus diario') || norm.includes('recompensa diaria') || norm.includes('ganhar gratis') ||
      norm.includes('presenca') || norm.includes('saldo gratis') || norm.includes('recompensa')
    ) {
      intentName = 'daily_checkin';
      nextStage = 'qualificado';
      reply = `🎁 *Como funciona o Check-in Diário TRUCKAUTO:*\n\nTodo dia que você entra no aplicativo, você pode clicar no botão **"Check-in Diário"** para registrar sua presença como operador de frota.\n\n⚡ *Vantagens do Check-in:*\n• **Bônus Imediato:** Ganhe de **R$ 0,50 a R$ 2,00 todo dia** creditado direto no seu saldo de forma 100% gratuita!\n• **Ativação da Frota:** Mantém seus rendimentos diários sincronizados com a rede de drones.\n• **Zero Custo:** Disponível para todos os usuários cadastrados.\n\n👉 Acesse o app agora e garanta seu bônus de hoje: ${this.appUrl}`;
    }

    // 3. AFILIADOS, NÍVEIS, COMISSÕES, GRADUAÇÕES & EFEITO CASCATA
    else if (
      norm.includes('afilia') || norm.includes('indica') || norm.includes('comissao') || norm.includes('comissoes') ||
      norm.includes('nivel') || norm.includes('niveis') || norm.includes('n1') || norm.includes('n2') || norm.includes('n3') ||
      norm.includes('rede') || norm.includes('recrut') || norm.includes('amigo') || norm.includes('convid') ||
      norm.includes('cascata') || norm.includes('patente') || norm.includes('gradua') || norm.includes('bronze') ||
      norm.includes('prata') || norm.includes('ouro') || norm.includes('rubi') || norm.includes('diamante') ||
      norm.includes('black diamond') || norm.includes('15') || norm.includes('10%') || norm.includes('5%') ||
      norm.includes('ganhar indicando') || norm.includes('como indicar') || norm.includes('filia')
    ) {
      intentName = 'affiliates_and_levels';
      nextStage = 'qualificado';
      reply = `🌟 *Sistema de Afiliados & Efeito Cascata TRUCKAUTO:*\n\nVocê ganha comissões automáticas em **3 níveis de profundidade** sobre cada recarga da sua rede:\n\n🥇 *Nível 1 (Seus Indicados Diretos):* **15% de comissão** no Pix\n🥈 *Nível 2 (Indicados dos seus amigos):* **10% de comissão** no Pix\n🥉 *Nível 3 (Terceira geração):* **5% de comissão** no Pix\n\n🏆 *Plano de Carreira & Bônus Pix de Graduação:*\n• 🥈 *Supervisor Prata (5 indicados):* Bônus de **+ R$ 100,00** no Pix\n• 🥇 *Gestor Ouro (15 indicados):* Bônus de **+ R$ 300,00** no Pix\n• 💎 *Diretor Rubi (50 indicados):* Bônus de **+ R$ 1.000,00** no Pix\n• 👑 *Embaixador Diamante (150 indicados):* Bônus de **+ R$ 3.000,00** no Pix\n• ⚡ *Sócio Black Diamond (500 indicados):* Bônus de **+ R$ 10.000,00** no Pix\n\n👉 Pegue seu link exclusivo na aba *Equipe* no app: ${this.appUrl}`;
    }

    // 4. RENDIMENTOS DIÁRIOS, COTAS, TABELA & VALORES
    else if (
      norm.includes('diario') || norm.includes('diarios') || norm.includes('quanto rende') || norm.includes('rendimento') ||
      norm.includes('tabela') || norm.includes('cota') || norm.includes('cotas') || norm.includes('preco') ||
      norm.includes('valor') || norm.includes('valores') || norm.includes('quanto custa') || norm.includes('lucro') ||
      norm.includes('ganho') || norm.includes('apex') || norm.includes('pulse') || norm.includes('zephyr') ||
      norm.includes('dash') || norm.includes('falcon') || norm.includes('stratus') || norm.includes('titan') || norm.includes('swift') ||
      norm.includes('investir') || norm.includes('comprar cota') || norm.includes('alugar')
    ) {
      intentName = 'fleets_pricing';
      nextStage = 'qualificado';
      reply = `📊 *Tabela Oficial de Frotas & Rendimentos Diários TRUCKAUTO:*\n\n🟢 *Entrada:*\n• *TruckAuto Pulse:* Cota R$ 30,00 ➔ **R$ 3,80/dia** (15 dias / Total R$ 57,00)\n• *TruckAuto Zephyr:* Cota R$ 150,00 ➔ **R$ 11,20/dia** (30 dias / Total R$ 336,00)\n\n🟡 *Popular & Alta Demanda:*\n• *TruckAuto Dash:* Cota R$ 350,00 ➔ **R$ 30,00/dia** (30 dias / Total R$ 900,00)\n• *TruckAuto Swift:* Cota R$ 600,00 ➔ **R$ 68,00/dia** (40 dias / Total R$ 2.720,00)\n• *TruckAuto Falcon:* Cota R$ 900,00 ➔ **R$ 75,00/dia** (45 dias / Total R$ 3.375,00)\n\n🟣 *VIP & Executivo:*\n• *TruckAuto Stratus:* Cota R$ 1.500,00 ➔ **R$ 150,00/dia** (60 dias / Total R$ 6.750,00)\n• *TruckAuto Titan:* Cota R$ 2.800,00 ➔ **R$ 150,00/dia** (60 dias / Total R$ 9.000,00)\n• *TruckAuto Apex:* Cota R$ 5.000,00 ➔ **R$ 250,00/dia** (60 dias / Total R$ 15.000,00)\n\n⚡ Os rendimentos caem todo dia à meia-noite no seu saldo com saque via Pix!\n👉 Qual dessas frotas melhor se encaixa no seu objetivo para eu te orientar a ativar?`;
    }

    // 5. SAQUES, RETIRADAS, HORÁRIOS & PIX
    else if (
      norm.includes('saque') || norm.includes('sacar') || norm.includes('retirar') || norm.includes('resgate') ||
      norm.includes('horario de saque') || norm.includes('minimo de saque') || norm.includes('cai na hora') ||
      norm.includes('prazo de saque') || norm.includes('taxa')
    ) {
      intentName = 'withdrawals_pix';
      nextStage = 'qualificado';
      reply = `💸 *Como funcionam os Saques no Pix TRUCKAUTO:*

• **Saques Diários:** Você pode sacar tanto seus rendimentos diários de frotas quanto suas comissões de equipe diretamente via Pix.\n• **Chave Pix Flexível:** Cadastre seu CPF, Telefone, E-mail ou Chave Aleatória na aba *Carteira* no aplicativo.\n• **Rapidez:** O valor cai rapidamente na sua conta bancária sem burocracia.\n\n👉 Acesse seu painel para acompanhar seu saldo e extrato: ${this.appUrl}`;
    }

    // 6. COMO ATIVAR / PAGAMENTO PIX / CADASTRO / PASSO A PASSO
    else if (
      norm.includes('pix') || norm.includes('pagar') || norm.includes('pagamento') || norm.includes('como ativo') ||
      norm.includes('como cadastro') || norm.includes('link') || norm.includes('site') || norm.includes('cadastrar') ||
      norm.includes('criar conta') || norm.includes('passo a passo') || norm.includes('recarga') || norm.includes('deposito') ||
      norm.includes('como funciona') || norm.includes('como comeco') || norm.includes('como começar')
    ) {
      intentName = 'activation_and_registration';
      nextStage = 'proposta';
      reply = `🚀 *Passo a Passo para Começar na TRUCKAUTO:*

1️⃣ **Acesse o Aplicativo:** ${this.appUrl}
2️⃣ **Crie seu Cadastro:** Informe seu número e defina uma senha.\n3️⃣ **Faça a Recarga Pix:** Clique em *Recarga Pix* e gere o QR Code do valor da cota desejada (ex: R$ 30, R$ 150, R$ 600, etc.).
4️⃣ **Ative seu Drone:** Vá na aba *Frotas* e confirme o aluguel do drone.

Assim que o Pix for pago, sua frota entra em operação e seu rendimento diário começa a rodar imediatamente!\n\n💬 *Grupo VIP Telegram:* ${this.telegramUrl}\nPrecisa de ajuda para gerar o código Pix?`;
    }

    // 7. SEGURANÇA, CONFIABILIDADE & SOBRE A EMPRESA
    else if (
      norm.includes('confiavel') || norm.includes('seguro') || norm.includes('empresa') || norm.includes('golpe') ||
      norm.includes('garantia') || norm.includes('quem sao') || norm.includes('de onde e') || norm.includes('verdade')
    ) {
      intentName = 'trust_and_company';
      nextStage = 'contato';
      reply = `🛡️ *Sobre a TRUCKAUTO & Segurança:*

A TRUCKAUTO é uma plataforma de gestão e financiamento compartilhado de frotas de drones autônomos.\n
• **Operação Real:** As frotas operam continuamente gerando receita de mobilidade urbana que é repartida proporcionalmente com cada cotista.\n• **Saques Comprovados:** Centenas de operadores sacam diariamente via Pix.\n• **Transparência:** Acompanhe comprovantes reais e atualizações no nosso Instagram Oficial: ${this.instagramUrl}\n• **Comunidade:** Converse com outros membros no Grupo VIP do Telegram: ${this.telegramUrl}\n
👉 Comece hoje com uma cota teste de R$ 30,00 no app: ${this.appUrl}`;
    }

    // 8. SAUDAÇÃO INICIAL / ABERTURA
    else if (
      norm === 'oi' || norm === 'ola' || norm === 'bom dia' || norm === 'boa tarde' || norm === 'boa noite' ||
      norm === 'opa' || norm === 'e ai' || norm === 'ola tudo bem' || norm === 'tudo bem' || norm === 'ola!'
    ) {
      intentName = 'greeting';
      nextStage = 'contato';
      reply = `Olá ${firstName}! Tudo bem? 🚕\n\nSeja muito bem-vindo à **TRUCKAUTO**. Nossas frotas autônomas geram rendimentos diários com saque via Pix a partir de R$ 30,00.\n\nSobre o que você gostaria de saber mais agora?\n\n1️⃣ 📊 *Tabela de Cotas & Rendimentos Diários*\n2️⃣ 🌟 *Sistema de Afiliados (15%, 10%, 5%) & Níveis de Carreira*\n3️⃣ 🎁 *Como funciona o Check-in Diário Grátis*\n4️⃣ 💸 *Como ativar sua cota no Pix e realizar saques*\n\nBasta me responder com o tema ou sua dúvida!`;
    }

    // 9. RESPOSTA INTELIGENTE DE APOIO
    else {
      intentName = 'contextual_help';
      nextStage = 'contato';
      reply = `Entendi sua mensagem, ${firstName}! 🚕\n\nNa **TRUCKAUTO**, você pode:\n• 📊 Ativar frotas com rendimentos diários de R$ 3,80 até R$ 250,00/dia no Pix.\n• 🌟 Indicar amigos e ganhar **15% (N1), 10% (N2) e 5% (N3)** + Bônus de até R$ 10.000,00 no Pix.\n• 🎁 Fazer o **Check-in Diário** gratuito para ganhar bônus todos os dias.\n\n👉 Acesse o aplicativo oficial: ${this.appUrl}\n💬 Grupo VIP Telegram: ${this.telegramUrl}\n\nSe quiser falar com um atendente humano, basta responder com a palavra **"Humano"**!`;
    }

    return {
      intent: intentName,
      reply,
      nextStage,
      pauseBot
    };
  }
}

const aiSdrInstance = new AISDREngine();
module.exports = aiSdrInstance;
