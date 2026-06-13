const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CANONICAL_USERS = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam'];

function normalizeUserName(name) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const exact = CANONICAL_USERS.find((u) => u.toLowerCase() === normalized);
  if (exact) return exact;
  const partial = CANONICAL_USERS.find((u) => u.toLowerCase().includes(normalized) || normalized.includes(u.toLowerCase()));
  return partial || null;
}

function convertToINR(amount, currency, exchangeRate) {
  if (!currency || currency.toUpperCase() === 'INR') {
    return amount;
  }
  if (currency.toUpperCase() === 'USD') {
    return amount * (exchangeRate || 83);
  }
  return amount;
}

function calculateSplits(amount, splitType, splitsInput, splitUserIds) {
  const splits = {};

  for (const userId of splitUserIds) {
    splits[userId] = 0;
  }

  if (splitType === 'equal') {
    const perPerson = amount / splitUserIds.length;
    for (const userId of splitUserIds) {
      splits[userId] = Math.round(perPerson * 100) / 100;
    }
    return splits;
  }

  if (splitType === 'unequal') {
    for (const item of splitsInput) {
      if (splits.hasOwnProperty(item.userId)) {
        splits[item.userId] = Math.round(item.value * 100) / 100;
      }
    }
    return splits;
  }

  if (splitType === 'percentage') {
    for (const item of splitsInput) {
      if (splits.hasOwnProperty(item.userId)) {
        const percentage = item.value / 100;
        splits[item.userId] = Math.round(amount * percentage * 100) / 100;
      }
    }
    return splits;
  }

  if (splitType === 'share') {
    const totalShares = splitsInput.reduce((sum, item) => sum + (item.value || 0), 0);
    if (totalShares === 0) {
      const perPerson = amount / splitUserIds.length;
      for (const userId of splitUserIds) {
        splits[userId] = Math.round(perPerson * 100) / 100;
      }
      return splits;
    }
    for (const item of splitsInput) {
      if (splits.hasOwnProperty(item.userId)) {
        const sharePercentage = item.value / totalShares;
        splits[item.userId] = Math.round(amount * sharePercentage * 100) / 100;
      }
    }
    return splits;
  }

  return splits;
}

async function createExpense(req, res) {
  try {
    const { id: groupId } = req.params;
    const { description, amount, currency, exchangeRate, splitType, splits, expenseDate, importedRow } = req.body;

    if (!description || !amount || !splitType || !expenseDate) {
      return res.status(400).json({ message: 'Missing required fields: description, amount, splitType, expenseDate' });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId
        }
      }
    });

    if (!membership || membership.leftAt !== null) {
      return res.status(403).json({ message: 'You are not an active member of this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { leftAt: null }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const activeMembers = group.members.map((m) => m.userId);
    const inrAmount = convertToINR(amount, currency, exchangeRate);

    const expenseSplits = calculateSplits(inrAmount, splitType, splits || [], activeMembers);

    const expense = await prisma.expense.create({
      data: {
        groupId,
        paidById: req.user.id,
        description,
        amount: inrAmount,
        originalAmount: currency && currency.toUpperCase() !== 'INR' ? amount : null,
        originalCurrency: currency && currency.toUpperCase() !== 'INR' ? currency : null,
        exchangeRate: currency && currency.toUpperCase() !== 'INR' ? exchangeRate : null,
        splitType,
        expenseDate: new Date(expenseDate),
        importedRow: importedRow || null,
        splits: {
          create: Object.entries(expenseSplits).map(([userId, splitAmount]) => ({
            userId,
            amount: splitAmount
          }))
        }
      },
      include: {
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

    return res.status(201).json({
      message: 'Expense created successfully',
      expense: {
        id: expense.id,
        groupId: expense.groupId,
        description: expense.description,
        amount: expense.amount,
        originalAmount: expense.originalAmount,
        originalCurrency: expense.originalCurrency,
        exchangeRate: expense.exchangeRate,
        splitType: expense.splitType,
        expenseDate: expense.expenseDate,
        importedRow: expense.importedRow,
        paidBy: expense.paidBy,
        splits: expense.splits.map((s) => ({
          id: s.id,
          userId: s.userId,
          amount: s.amount,
          user: s.user
        })),
        createdAt: expense.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create expense' });
  }
}

async function getGroupExpenses(req, res) {
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

    if (!membership || membership.leftAt !== null) {
      return res.status(403).json({ message: 'You are not an active member of this group' });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
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
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        expenseDate: 'desc'
      }
    });

    return res.status(200).json({
      expenses: expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        originalAmount: expense.originalAmount,
        originalCurrency: expense.originalCurrency,
        splitType: expense.splitType,
        expenseDate: expense.expenseDate,
        importedRow: expense.importedRow,
        paidBy: expense.paidBy,
        splitsCount: expense.splits.length,
        createdAt: expense.createdAt
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load expenses' });
  }
}

async function getExpenseById(req, res) {
  try {
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id },
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
        splits: expense.splits.map((s) => ({
          id: s.id,
          userId: s.userId,
          amount: s.amount,
          user: s.user
        })),
        createdAt: expense.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load expense' });
  }
}

async function deleteExpense(req, res) {
  try {
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id }
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (expense.paidById !== req.user.id) {
      return res.status(403).json({ message: 'Only the person who paid can delete this expense' });
    }

    await prisma.expense.delete({
      where: { id }
    });

    return res.status(200).json({
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete expense' });
  }
}

module.exports = {
  createExpense,
  getGroupExpenses,
  getExpenseById,
  deleteExpense,
  normalizeUserName
};
