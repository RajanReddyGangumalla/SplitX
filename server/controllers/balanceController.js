const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function simplifyBalances(pairBalances) {
  // pairBalances: { "userId1|userId2": amount (positive = userId1 owes userId2) }
  const simplified = [];

  for (const [key, amount] of Object.entries(pairBalances)) {
    if (amount !== 0) {
      const [userId1, userId2] = key.split('|');
      if (amount > 0) {
        simplified.push({
          from: userId1,
          to: userId2,
          amount: Math.round(amount * 100) / 100
        });
      } else {
        simplified.push({
          from: userId2,
          to: userId1,
          amount: Math.round(Math.abs(amount) * 100) / 100
        });
      }
    }
  }

  return simplified;
}

async function getGroupBalances(req, res) {
  try {
    const { id: groupId } = req.params;

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        expenses: {
          include: {
            paidBy: {
              select: { id: true, name: true }
            },
            splits: {
              include: {
                user: { select: { id: true, name: true } }
              }
            }
          }
        },
        settlements: {
          include: {
            payer: { select: { id: true, name: true } },
            payee: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const pairBalances = {};

    for (const member of group.members) {
      for (const otherMember of group.members) {
        if (member.user.id !== otherMember.user.id) {
          const key = [member.user.id, otherMember.user.id].sort().join('|');
          if (!pairBalances[key]) {
            pairBalances[key] = 0;
          }
        }
      }
    }

    for (const expense of group.expenses) {
      for (const split of expense.splits) {
        if (split.userId !== expense.paidById) {
          const key = [split.userId, expense.paidById].sort().join('|');
          const direction = split.userId < expense.paidById ? 1 : -1;
          pairBalances[key] += split.amount * direction;
        }
      }
    }

    for (const settlement of group.settlements) {
      const key = [settlement.payerId, settlement.payeeId].sort().join('|');
      const direction = settlement.payerId < settlement.payeeId ? 1 : -1;
      pairBalances[key] -= settlement.amount * direction;
    }

    const simplified = simplifyBalances(pairBalances);

    const userSummary = {};
    for (const member of group.members) {
      userSummary[member.user.id] = {
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        owes: 0,
        isOwed: 0,
        net: 0
      };
    }

    for (const balance of simplified) {
      if (balance.amount > 0) {
        userSummary[balance.from].owes += balance.amount;
        userSummary[balance.to].isOwed += balance.amount;
      }
    }

    for (const userId of Object.keys(userSummary)) {
      const summary = userSummary[userId];
      summary.net = summary.isOwed - summary.owes;
    }

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name
      },
      balances: simplified,
      summary: Object.values(userSummary)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to calculate balances' });
  }
}

async function getExpenseBreakdown(req, res) {
  try {
    const { id: expenseId } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        group: {
          select: {
            id: true,
            name: true
          }
        },
        paidBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        splits: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId: expense.groupId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this expense group' });
    }

    return res.status(200).json({
      expense: {
        id: expense.id,
        groupId: expense.groupId,
        groupName: expense.group.name,
        description: expense.description,
        amount: expense.amount,
        originalAmount: expense.originalAmount,
        originalCurrency: expense.originalCurrency,
        exchangeRate: expense.exchangeRate,
        splitType: expense.splitType,
        expenseDate: expense.expenseDate,
        importedRow: expense.importedRow,
        paidBy: expense.paidBy,
        createdAt: expense.createdAt
      },
      splits: expense.splits.map((split) => ({
        splitId: split.id,
        userId: split.userId,
        userName: split.user.name,
        userEmail: split.user.email,
        amountOwed: split.amount
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load expense breakdown' });
  }
}

async function getUserBalances(req, res) {
  try {
    const userId = req.user.id;

    const memberships = await prisma.groupMember.findMany({
      where: {
        userId,
        leftAt: null
      },
      include: {
        group: {
          include: {
            members: {
              where: { leftAt: null }
            },
            expenses: {
              include: {
                paidBy: { select: { id: true } },
                splits: true
              }
            },
            settlements: true
          }
        }
      }
    });

    let totalOwes = 0;
    let totalIsOwed = 0;
    const groupBreakdown = [];

    for (const membership of memberships) {
      const group = membership.group;
      let groupOwes = 0;
      let groupIsOwed = 0;

      for (const expense of group.expenses) {
        const userSplit = expense.splits.find((s) => s.userId === userId);
        if (userSplit && userSplit.amount > 0) {
          if (expense.paidById === userId) {
            groupIsOwed += userSplit.amount;
          } else {
            groupOwes += userSplit.amount;
          }
        }
      }

      for (const settlement of group.settlements) {
        if (settlement.payerId === userId) {
          groupOwes -= settlement.amount;
        } else if (settlement.payeeId === userId) {
          groupIsOwed -= settlement.amount;
        }
      }

      totalOwes += Math.max(groupOwes, 0);
      totalIsOwed += Math.max(groupIsOwed, 0);

      groupBreakdown.push({
        groupId: group.id,
        groupName: group.name,
        owes: Math.round(Math.max(groupOwes, 0) * 100) / 100,
        isOwed: Math.round(Math.max(groupIsOwed, 0) * 100) / 100,
        net: Math.round((groupIsOwed - groupOwes) * 100) / 100
      });
    }

    return res.status(200).json({
      user: {
        id: userId,
        name: req.user.name,
        email: req.user.email
      },
      summary: {
        totalOwes: Math.round(totalOwes * 100) / 100,
        totalIsOwed: Math.round(totalIsOwed * 100) / 100,
        netBalance: Math.round((totalIsOwed - totalOwes) * 100) / 100
      },
      groupBreakdown
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to calculate user balances' });
  }
}

async function recordSettlement(req, res) {
  try {
    const { payeeId, groupId, amount } = req.body;
    const payerId = req.user.id;

    if (!payeeId || !groupId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Missing required fields: payeeId, groupId, amount (must be > 0)' });
    }

    const payerMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: payerId,
          groupId
        }
      }
    });

    if (!payerMembership || payerMembership.leftAt !== null) {
      return res.status(403).json({ message: 'You are not an active member of this group' });
    }

    const payeeMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: payeeId,
          groupId
        }
      }
    });

    if (!payeeMembership) {
      return res.status(403).json({ message: 'Payee is not a member of this group' });
    }

    const payer = await prisma.user.findUnique({
      where: { id: payerId },
      select: { id: true, name: true, email: true }
    });

    const payee = await prisma.user.findUnique({
      where: { id: payeeId },
      select: { id: true, name: true, email: true }
    });

    const settlement = await prisma.settlement.create({
      data: {
        payerId,
        payeeId,
        groupId,
        amount: Math.round(amount * 100) / 100,
        settledAt: new Date()
      }
    });

    return res.status(201).json({
      message: 'Settlement recorded successfully',
      settlement: {
        id: settlement.id,
        payer,
        payee,
        groupId: settlement.groupId,
        amount: settlement.amount,
        settledAt: settlement.settledAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to record settlement' });
  }
}

async function getGroupSettlements(req, res) {
  try {
    const { id: groupId } = req.params;

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: {
          select: { id: true, name: true, email: true }
        },
        payee: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: {
        settledAt: 'desc'
      }
    });

    return res.status(200).json({
      settlements: settlements.map((s) => ({
        id: s.id,
        payer: s.payer,
        payee: s.payee,
        amount: s.amount,
        settledAt: s.settledAt,
        importedRow: s.importedRow
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load settlements' });
  }
}

module.exports = {
  getGroupBalances,
  getExpenseBreakdown,
  getUserBalances,
  recordSettlement,
  getGroupSettlements
};
