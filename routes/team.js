const express = require('express');
const router = express.Router();
const { getAllUsers, getTransactionsByUserId } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const {
  RANKS,
  calculateUserNetwork,
  evaluateUserRank,
  checkAndPromoteUser
} = require('../services/careerEngine');

// Estatísticas e Níveis da Equipe com Plano de Carreira
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const currentUserId = req.user.id;
    const currentUser = allUsers.find(u => u.id === currentUserId) || req.user;

    // Avalia promoção se houver
    await checkAndPromoteUser(currentUserId, allUsers);

    const network = calculateUserNetwork(currentUserId, allUsers);
    const careerInfo = evaluateUserRank(network, currentUser);

    // Total de comissões ganhas
    const userTx = await getTransactionsByUserId(currentUserId);
    const myCommissions = userTx.filter(t => t.type === 'commission');
    const totalCommission = myCommissions.reduce((acc, t) => acc + t.amount, 0);

    const l1Comm = myCommissions.filter(t => t.description.includes('Nível 1')).reduce((acc, t) => acc + t.amount, 0);
    const l2Comm = myCommissions.filter(t => t.description.includes('Nível 2')).reduce((acc, t) => acc + t.amount, 0);
    const l3Comm = myCommissions.filter(t => t.description.includes('Nível 3')).reduce((acc, t) => acc + t.amount, 0);
    const l4Comm = myCommissions.filter(t => t.description.includes('Nível 4')).reduce((acc, t) => acc + t.amount, 0);
    const l5Comm = myCommissions.filter(t => t.description.includes('Nível 5')).reduce((acc, t) => acc + t.amount, 0);

    const levels = [
      {
        id: 1,
        name: 'Nível 1 (Diretos)',
        percent: 10,
        members: network.l1.length,
        generated: l1Comm,
        unlocked: careerInfo.unlockedLevels.includes(1),
        unlockRequirement: 'Liberado para todos',
        icon: 'fa-users-viewfinder'
      },
      {
        id: 2,
        name: 'Nível 2',
        percent: 10,
        members: network.l2.length,
        generated: l2Comm,
        unlocked: careerInfo.unlockedLevels.includes(2),
        unlockRequirement: 'Liberado no Supervisor Prata (5 indicados)',
        icon: 'fa-network-wired'
      },
      {
        id: 3,
        name: 'Nível 3',
        percent: 10,
        members: network.l3.length,
        generated: l3Comm,
        unlocked: careerInfo.unlockedLevels.includes(3),
        unlockRequirement: 'Liberado no Gestor Ouro (15 membros)',
        icon: 'fa-diagram-project'
      },
      {
        id: 4,
        name: 'Nível 4 (Rubi)',
        percent: 10,
        members: network.l4.length,
        generated: l4Comm,
        unlocked: careerInfo.unlockedLevels.includes(4),
        unlockRequirement: 'Liberado no Diretor Rubi (50 membros)',
        icon: 'fa-gem'
      },
      {
        id: 5,
        name: 'Nível 5 (Diamante)',
        percent: 10,
        members: network.l5.length,
        generated: l5Comm,
        unlocked: careerInfo.unlockedLevels.includes(5),
        unlockRequirement: 'Liberado no Embaixador Diamante (150 membros)',
        icon: 'fa-crown'
      }
    ];

    res.json({
      totalMembers: network.totalMembers,
      activeMembers: network.totalMembers,
      directsCount: network.directsCount,
      totalCommission: totalCommission,
      career: {
        currentRank: careerInfo.currentRank,
        nextRank: careerInfo.nextRank,
        progressPercent: careerInfo.progressPercent,
        remainingDirects: careerInfo.remainingDirects,
        remainingTotal: careerInfo.remainingTotal,
        isLevel3Unlocked: careerInfo.isLevel3Unlocked
      },
      ranks: RANKS,
      levels
    });
  } catch (err) {
    console.error('[TEAM ERROR /overview]:', err);
    res.status(500).json({ error: 'Erro ao buscar dados da equipe.' });
  }
});

module.exports = router;

