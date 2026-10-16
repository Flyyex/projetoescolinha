const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  findProductById,
  getContractsByUserId,
  createContract,
  findUserById,
  updateUser,
  createTransaction,
  newContractId
} = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { distributeCareerCommissions } = require('../services/careerEngine');
const { shouldPayCommission } = require('../services/limits');

// ==========================================
// CARÊNCIA DE COMPRA POR MODELO (30 dias)
// ==========================================
// Conta a partir da data da compra do contrato mais recente do MESMO modelo,
// e o prazo vale mesmo que o contrato já tenha finalizado. Outro modelo não
// é afetado. A ideia é forçar a comprar mais de uma vez em vez de parcelar.
const COOLDOWN_DAYS = 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function fmtDataBr(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) { return '—'; }
}

function cooldownsForModel(contracts, productId) {
  const doModelo = (contracts || []).filter(c => c.productId === productId);
  if (!doModelo.length) return { bloqueado: false, diasRestantes: 0, liberacao: null, mensagem: '' };
  const ultimo = doModelo
    .slice()
    .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0];
  if (!ultimo || !ultimo.startDate) return { bloqueado: false, diasRestantes: 0, liberacao: null, mensagem: '' };

  const liberacaoMs = new Date(ultimo.startDate).getTime() + COOLDOWN_MS;
  const restante = liberacaoMs - Date.now();
  if (restante <= 0) return { bloqueado: false, diasRestantes: 0, liberacao: null, mensagem: '' };

  const liberacao = new Date(liberacaoMs).toISOString();
  const dias = Math.max(1, Math.ceil(restante / (24 * 60 * 60 * 1000)));
  return {
    bloqueado: true,
    diasRestantes: dias,
    liberacao,
    // Mensagem neutra de propósito: a regra de carência é interna, o cliente
    // não precisa saber dela nem do prazo. O `diasRestantes`/`liberacao` continuam
    // na resposta para uso administrativo.
    mensagem: 'Limite deste modelo atingido.'
  };
}

// Listar Produtos / Veículos Disponíveis
router.get('/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    console.error('[FLEET ERROR /products]:', err);
    res.status(500).json({ error: 'Erro ao listar veículos.' });
  }
});

// Listar Contratos Ativos do Usuário
router.get('/my-contracts', authMiddleware, async (req, res) => {
  try {
    const userContracts = await getContractsByUserId(req.user.id);
    res.json(userContracts);
  } catch (err) {
    console.error('[FLEET ERROR /my-contracts]:', err);
    res.status(500).json({ error: 'Erro ao buscar contratos.' });
  }
});

// Contratar Veículo
router.post('/hire', authMiddleware, async (req, res) => {
  try {
    const { productId, payFrom: payFromReq } = req.body;
    const product = await findProductById(productId);

    if (!product) {
      return res.status(404).json({ error: 'Veículo não encontrado.' });
    }

    const user = await findUserById(req.user.id);
    const price = parseFloat(product.price || 0);
    if (!(price > 0)) {
      return res.status(400).json({ error: 'Produto sem preço configurado. Fale com o suporte.' });
    }
    const investBal = Math.round(parseFloat(user.investBalance || 0) * 100) / 100;
    const earnBal = Math.round(parseFloat(user.earnBalance || 0) * 100) / 100;
    // Sem misturar: valor cheio precisa caber em UM dos saldos.
    // O app envia a carteira escolhida (payFrom); sem ela, tenta investir primeiro.
    let payFrom = null;
    if (payFromReq === 'invest' || payFromReq === 'earn') {
      const bal = payFromReq === 'invest' ? investBal : earnBal;
      if (bal < price) {
        return res.status(400).json({ error: `Saldo ${payFromReq === 'invest' ? 'para investir' : 'para saque'} insuficiente (R$ ${bal.toFixed(2)}).` });
      }
      payFrom = payFromReq;
    } else {
      if (investBal >= price) payFrom = 'invest';
      else if (earnBal >= price) payFrom = 'earn';
    }
    if (!payFrom) {
      return res.status(400).json({ error: `Saldo insuficiente em um único saldo. Investir: R$ ${investBal.toFixed(2)} • Saque: R$ ${earnBal.toFixed(2)}.` });
    }

    const priceNum = parseFloat(product.price || 0);
    const MAX_PER_MODEL = product.id.startsWith('CH-') ? 1 : (priceNum >= 79 ? 1 : 2);
    const existingContracts = await getContractsByUserId(req.user.id);
    const activeSameModel = existingContracts.filter(c => c.status === 'Em corrida' && c.productId === product.id).length;
    if (activeSameModel >= MAX_PER_MODEL) {
      return res.status(403).json({ error: `Limite de ${MAX_PER_MODEL} ${MAX_PER_MODEL === 1 ? 'unidade deste ponto' : 'unidades deste drone'} por vez. Aguarde um contrato finalizar para comprar novamente.` });
    }

    // Carência por modelo: 30 dias contados da DATA DA COMPRA (não do fim do
    // ciclo). Ela só começa a valer DEPOIS que o modelo foi lotado, e é por
    // isso que conta contratos TOTAIS do modelo, não só os que estão em
    // corrida: comprar a 1ª de 2 não trava nada (dá pra comprar a 2ª na hora e
    // salir com ticket maior); a partir daí, uma nova unidade do mesmo modelo
    // só entra 30 dias depois da última compra.
    // Outro modelo não é bloqueado por esta regra.
    const totalSameModel = existingContracts.filter(c => c.productId === product.id).length;
    if (totalSameModel >= MAX_PER_MODEL) {
      const carencia = cooldownsForModel(existingContracts, product.id);
      if (carencia.bloqueado) {
        return res.status(403).json({
          error: carencia.mensagem,
          cooldownUntil: carencia.liberacao,
          cooldownDaysLeft: carencia.diasRestantes
        });
      }
    }

    // Debita do saldo escolhido (sem misturar)
    const paidInvest = payFrom === 'invest' ? price : 0;
    const paidEarn = payFrom === 'earn' ? price : 0;
    const newInvest = Math.round((investBal - paidInvest) * 100) / 100;
    const newEarn = Math.round((earnBal - paidEarn) * 100) / 100;
    const newBalance = Math.round((newInvest + newEarn) * 100) / 100;
    await updateUser(user.id, { investBalance: newInvest, earnBalance: newEarn, balance: newBalance });

    // Cria novo contrato
    const newContract = {
      id: newContractId(),
      userId: user.id,
      productId: product.id,
      productName: product.name,
      dailyReturn: product.dailyReturn,
      totalDays: product.periodDays,
      daysRemaining: product.periodDays,
      status: 'Em corrida',
      startDate: new Date().toISOString(),
      lastSettlement: new Date().toISOString()
    };

    await createContract(newContract);

    // Registra transação da contratação
    await createTransaction({
      id: `TX-${Date.now()}`,
      userId: user.id,
      type: 'contract',
      amount: -product.price,
      status: 'approved',
      description: `Contratação de ${product.name} (saldo ${payFrom === 'invest' ? 'investir' : 'saque'})`,
      createdAt: new Date().toISOString()
    });

    // Comissão Multinível com Plano de Carreira e Desbloqueio Progressivo de 5 Níveis
    // Fase 2: sem comissão sobre saldo só-bônus — comprador precisa já ter depositado
    try {
      const { getMoneyLimits } = require('../database');
      const { minDeposit } = await getMoneyLimits();
      if (shouldPayCommission({ buyerTotalDeposited: user.totalDeposited, minDeposit })) {
        await distributeCareerCommissions({
          buyerUser: user,
          amount: product.price,
          productName: product.name
        });
      } else {
        console.log(`[COMMISSION SKIP] ${user.id} sem depósito confirmado — comissão retida (anti-farm).`);
      }
    } catch (e) {
      console.error('[FLEET COMMISSION GUARD ERROR]:', e.message);
    }

    res.status(201).json({
      message: 'Contrato ativado com sucesso!',
      contract: newContract,
      newBalance: newBalance,
      paidFrom: payFrom
    });
  } catch (err) {
    console.error('[FLEET ERROR /hire]:', err);
    res.status(500).json({ error: 'Erro ao processar contratação.' });
  }
});

module.exports = router;

