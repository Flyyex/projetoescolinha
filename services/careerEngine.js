const {
  getAllUsers,
  findUserById,
  updateUser,
  createTransaction,
  getTransactionsByUserId
} = require('../database');

const RANKS = [
  {
    id: 'bronze',
    name: 'Operador Bronze',
    icon: '🥉',
    badge: '🥉 Bronze',
    minDirects: 0,
    minTotal: 0,
    unlockedLevels: [1],
    bonus: 0,
    description: '10% no Nível 1'
  },
  {
    id: 'prata',
    name: 'Supervisor Prata',
    icon: '🥈',
    badge: '🥈 Prata',
    minDirects: 5,
    minTotal: 5,
    unlockedLevels: [1, 2],
    bonus: 50.00,
    description: '10% N1 + 10% N2 (+ R$ 50 no Pix)'
  },
  {
    id: 'ouro',
    name: 'Gestor Ouro',
    icon: '🥇',
    badge: '🥇 Ouro',
    minDirects: 5,
    minTotal: 15,
    unlockedLevels: [1, 2, 3],
    bonus: 150.00,
    description: '10% + 10% + 10% (+ R$ 150 no Pix)'
  },
  {
    id: 'rubi',
    name: 'Diretor Rubi',
    icon: '💎',
    badge: '💎 Rubi',
    minDirects: 10,
    minTotal: 50,
    unlockedLevels: [1, 2, 3, 4],
    bonus: 500.00,
    description: '10% + 10% + 10% + 10% N4 (+ R$ 500 no Pix)'
  },
  {
    id: 'diamante',
    name: 'Embaixador Diamante',
    icon: '👑',
    badge: '👑 Diamante',
    minDirects: 15,
    minTotal: 150,
    unlockedLevels: [1, 2, 3, 4, 5],
    bonus: 2000.00,
    description: '10% + 10% + 10% + 10% + 10% N5 (+ R$ 2.000 no Pix + Cota Falcon)'
  },
  {
    id: 'black_diamond',
    name: 'Sócio Black Diamond',
    icon: '⚡',
    badge: '⚡ Black Diamond',
    minDirects: 25,
    minTotal: 500,
    unlockedLevels: [1, 2, 3, 4, 5],
    bonus: 10000.00,
    description: 'Profundidade Total + Pool Global 1% (+ R$ 10.000 no Pix)'
  }
];

const LEVEL_PERCENTS = {
  1: 0.10, // 10%
  2: 0.10, // 10%
  3: 0.10, // 10%
  4: 0.10, // 10%
  5: 0.10  // 10%
};

function calculateUserNetwork(userId, allUsers) {
  const targetUser = allUsers.find(u => u.id === userId);

function isReferredBy(childUser, parentUser) {
if (!childUser || !childUser.referredBy || !parentUser) return false;
if (childUser.referredBy === parentUser.id) return true;
if (parentUser.inviteCode && String(childUser.referredBy).toUpperCase() === String(parentUser.inviteCode).toUpperCase()) return true;
return false;
}
// Só conta quem fez ao menos 1 depósito real confirmado (bônus/saldo não qualificam)
function hasFunded(u) {
if (!u) return false;
return parseFloat(u.totalDeposited || 0) > 0;
}
const l1Users = allUsers.filter(u => targetUser && isReferredBy(u, targetUser) && hasFunded(u));
const l2Users = allUsers.filter(u => hasFunded(u) && l1Users.some(parent => isReferredBy(u, parent)));
const l3Users = allUsers.filter(u => hasFunded(u) && l2Users.some(parent => isReferredBy(u, parent)));
const l4Users = allUsers.filter(u => hasFunded(u) && l3Users.some(parent => isReferredBy(u, parent)));
const l5Users = allUsers.filter(u => hasFunded(u) && l4Users.some(parent => isReferredBy(u, parent)));

  const totalMembers = l1Users.length + l2Users.length + l3Users.length + l4Users.length + l5Users.length;

  return {
    l1: l1Users,
    l2: l2Users,
    l3: l3Users,
    l4: l4Users,
    l5: l5Users,
    totalMembers,
    totalTeam: totalMembers,
    directsCount: l1Users.length
  };
}

function evaluateUserRank(networkData, userParam = null) {
  const { directsCount, totalMembers, totalTeam, l3 } = networkData;
  const count = directsCount !== undefined ? directsCount : (networkData.l1 ? networkData.l1.length : 0);
  const total = totalMembers !== undefined ? totalMembers : (totalTeam !== undefined ? totalTeam : 0);
  const l3Count = l3 ? l3.length : 0;

  let currentRankIndex = 0;

  for (let i = RANKS.length - 1; i >= 0; i--) {
    const rank = RANKS[i];
    let qualifies = false;

    if (rank.id === 'bronze') {
      qualifies = true;
    } else if (rank.id === 'prata') {
      qualifies = count >= rank.minDirects;
    } else if (rank.id === 'ouro') {
      qualifies = count >= rank.minDirects && total >= rank.minTotal && l3Count >= 1;
    } else {
      qualifies = count >= rank.minDirects && total >= rank.minTotal;
    }

    if (qualifies) {
      currentRankIndex = i;
      break;
    }
  }

  // Se o usuário possui patente definida manualmente no painel admin (override)
  if (userParam && userParam.careerRank) {
    const manualIdx = RANKS.findIndex(r => r.id === userParam.careerRank);
    if (manualIdx > currentRankIndex) {
      currentRankIndex = manualIdx;
    }
  }

  const currentRank = RANKS[currentRankIndex];
  const nextRank = currentRankIndex < RANKS.length - 1 ? RANKS[currentRankIndex + 1] : null;

  let progressPercent = 100;
  let remainingDirects = 0;
  let remainingTotal = 0;

  if (nextRank) {
    remainingDirects = Math.max(0, nextRank.minDirects - count);
    remainingTotal = Math.max(0, nextRank.minTotal - total);
    
    const directProg = nextRank.minDirects > 0 ? (count / nextRank.minDirects) : 1;
    const totalProg = nextRank.minTotal > 0 ? (total / nextRank.minTotal) : 1;
    progressPercent = Math.min(99, Math.round(((directProg + totalProg) / 2) * 100));
  }

  return {
    currentRank,
    nextRank,
    progressPercent,
    remainingDirects,
    remainingTotal,
    unlockedLevels: currentRank.unlockedLevels,
    isLevel3Unlocked: currentRank.unlockedLevels.includes(3) || Boolean(userParam && userParam.forceLevel3Unlocked)
  };
}

async function checkAndPromoteUser(userId, allUsersParam = null) {
  try {
    const allUsers = allUsersParam || await getAllUsers();
    const user = allUsers.find(u => u.id === userId);
    if (!user) return null;

    const network = calculateUserNetwork(userId, allUsers);
    const { currentRank } = evaluateUserRank(network, user);

    const userTx = await getTransactionsByUserId(userId);
    const awardedBonuses = userTx
      .filter(t => t.type === 'bonus' && (t.description || '').includes('Bônus de Graduação'))
      .map(t => t.description);

    const rankBonusDescription = 'Bônus de Graduação - ' + currentRank.name;

    if (currentRank.bonus > 0 && !awardedBonuses.some(d => d.includes(currentRank.name))) {
      console.log('[CAREER ADVANCEMENT] Operador ' + user.operatorName + ' atingiu ' + currentRank.name + '! Creditando R$ ' + currentRank.bonus.toFixed(2));

      await updateUser(user.id, {
        earnBalanceInc: currentRank.bonus,
        balanceInc: currentRank.bonus,
        vipLevel: currentRank.badge,
        careerRank: currentRank.id
      });

      await createTransaction({
        id: 'RANK-' + Date.now() + '-' + currentRank.id,
        userId: user.id,
        type: 'bonus',
        amount: currentRank.bonus,
        status: 'approved',
        description: rankBonusDescription,
        createdAt: new Date().toISOString()
      });
    }

    return { user, currentRank, network };
  } catch (err) {
    console.error('[CAREER ENGINE ERROR /checkAndPromoteUser]:', err);
    return null;
  }
}

async function distributeCareerCommissions({ buyerUser, amount, productName }) {
  try {
    const allUsers = await getAllUsers();
    let currentUplineId = buyerUser.referredBy;
    const now = new Date().toISOString();

    for (let level = 1; level <= 5; level++) {
      if (!currentUplineId) break;

      const uplineUser = allUsers.find(u => u.id === currentUplineId);
      if (!uplineUser) break;

      const network = calculateUserNetwork(uplineUser.id, allUsers);
      const { unlockedLevels, currentRank } = evaluateUserRank(network);
      const percent = LEVEL_PERCENTS[level] || 0;
      const commissionAmount = amount * percent;

      if (unlockedLevels.includes(level)) {
        await updateUser(uplineUser.id, { earnBalanceInc: commissionAmount, balanceInc: commissionAmount });

        await createTransaction({
          id: 'COMM-' + Date.now() + '-L' + level + '-' + uplineUser.id.slice(-4),
          userId: uplineUser.id,
          type: 'commission',
          amount: commissionAmount,
          status: 'approved',
          description: 'Comissão Nível ' + level + ' (' + (percent * 100).toFixed(0) + '% de ' + buyerUser.operatorName + ') - ' + productName,
          createdAt: now
        });

        console.log('[COMMISSION L' + level + '] Creditado R$ ' + commissionAmount.toFixed(2) + ' para ' + uplineUser.operatorName + ' (' + currentRank.name + ')');
      } else {
        console.log('[COMMISSION COMPRESSED] Nível ' + level + ' retido para ' + uplineUser.operatorName + ' (Requer patente superior).');
      }

      await checkAndPromoteUser(uplineUser.id, allUsers);
      currentUplineId = uplineUser.referredBy;
    }
  } catch (err) {
    console.error('[CAREER ENGINE ERROR /distributeCareerCommissions]:', err);
  }
}

module.exports = {
  RANKS,
  LEVEL_PERCENTS,
  calculateUserNetwork,
  evaluateUserRank,
  checkAndPromoteUser,
  distributeCareerCommissions
};
