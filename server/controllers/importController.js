const { PrismaClient } = require('@prisma/client');
const csv = require('csv-parser');
const { Readable } = require('stream');

const prisma = new PrismaClient();

const CANONICAL_USERS = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam'];
const USD_TO_INR = 83;

function normalizeUserName(name) {
  if (!name) return null;
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();

  const exact = CANONICAL_USERS.find((userName) => userName.toLowerCase() === normalized);
  if (exact) return exact;

  const partial = CANONICAL_USERS.find(
    (userName) =>
      userName.toLowerCase().includes(normalized) || normalized.includes(userName.toLowerCase())
  );

  return partial || null;
}

function parseCSVData(fileBuffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const readable = Readable.from([fileBuffer.toString('utf8')]);

    readable
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('error', (error) => reject(error))
      .on('end', () => resolve(rows));
  });
}

function parseDate(value) {
  if (!value) return null;

  const trimmed = String(value).trim();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const shortMatch = trimmed.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  if (shortMatch) {
    const [, monthShort, dayPart] = shortMatch;
    const year = new Date().getFullYear();
    const rebuilt = new Date(`${monthShort} ${dayPart}, ${year}`);
    if (!Number.isNaN(rebuilt.getTime())) {
      return rebuilt;
    }
  }

  return null;
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;

  const cleaned = String(value).replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseSplitList(value) {
  if (!value) return [];
  return String(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSplitDetailPairs(value) {
  if (!value) return [];

  return String(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const split = item.split(/\s+/);
      const rawValue = split.pop();
      const name = split.join(' ').trim();
      return {
        name,
        value: Number(String(rawValue).replace('%', ''))
      };
    })
    .filter((item) => item.name && !Number.isNaN(item.value));
}

function isSettlementRow(row) {
  const description = String(row.description || '').toLowerCase();
  const notes = String(row.notes || '').toLowerCase();

  return description.includes('paid back') || notes.includes('settlement');
}

function findExactDuplicate(row, previousRows) {
  const targetKey = `${String(row.description || '').trim().toLowerCase()}|${String(row.date || '').trim().toLowerCase()}|${String(row.amountNumeric || '').trim()}`;

  return previousRows.find((previous) => {
    const previousKey = `${String(previous.description || '').trim().toLowerCase()}|${String(previous.date || '').trim().toLowerCase()}|${String(previous.amountNumeric || '').trim()}`;
    return previousKey === targetKey;
  });
}

function findConflictDuplicate(row, previousRows) {
  const targetKey = `${String(row.description || '').trim().toLowerCase()}|${String(row.date || '').trim().toLowerCase()}`;

  return previousRows.find((previous) => {
    const previousKey = `${String(previous.description || '').trim().toLowerCase()}|${String(previous.date || '').trim().toLowerCase()}`;
    const differentAmount = Number(previous.amountNumeric) !== Number(row.amountNumeric);
    const differentPaidBy = String(previous.normalizedPaidBy || '') !== String(row.normalizedPaidBy || '');
    return previousKey === targetKey && (differentAmount || differentPaidBy);
  });
}

async function ensureUserByName(name) {
  const canonicalName = normalizeUserName(name) || String(name || '').trim();
  if (!canonicalName) return null;

  const emailSlug = canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '.');
  const email = `${emailSlug}@splitx.local`;

  const existingByName = await prisma.user.findUnique({
    where: { name: canonicalName }
  });

  if (existingByName) {
    return existingByName;
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email }
  });

  if (existingByEmail) {
    return existingByEmail;
  }

  return prisma.user.create({
    data: {
      name: canonicalName,
      email,
      password: 'imported-user-placeholder-password'
    }
  });
}

async function ensureGroupMember(groupId, userId, joinedAt) {
  const existing = await prisma.groupMember.findUnique({
    where: {
      userId_groupId: {
        userId,
        groupId
      }
    }
  });

  if (existing) {
    if (existing.leftAt !== null) {
      return prisma.groupMember.update({
        where: {
          userId_groupId: {
            userId,
            groupId
          }
        },
        data: {
          leftAt: null,
          joinedAt: joinedAt || existing.joinedAt
        }
      });
    }

    return existing;
  }

  return prisma.groupMember.create({
    data: {
      userId,
      groupId,
      role: 'member',
      joinedAt: joinedAt || new Date(),
      leftAt: null
    }
  });
}

function buildEqualSplits(amount, userIds) {
  if (!userIds.length) return [];

  const perPerson = Math.round((amount / userIds.length) * 100) / 100;
  const splits = userIds.map((userId, index) => ({
    userId,
    amount: index === userIds.length - 1 ? Math.round((amount - perPerson * (userIds.length - 1)) * 100) / 100 : perPerson
  }));

  return splits;
}

function buildUnequalSplits(amount, splitPairs, userMap) {
  const splits = [];
  let total = 0;

  for (const pair of splitPairs) {
    const user = userMap.get(normalizeUserName(pair.name));
    if (!user) continue;

    const splitAmount = Math.round(Number(pair.value) * 100) / 100;
    total += splitAmount;
    splits.push({ userId: user.id, amount: splitAmount });
  }

  return { splits, total: Math.round(total * 100) / 100 };
}

function buildPercentageSplits(amount, splitPairs, userMap) {
  const splits = [];
  let totalPercentage = 0;

  for (const pair of splitPairs) {
    const user = userMap.get(normalizeUserName(pair.name));
    if (!user) continue;

    const percentage = Number(pair.value);
    totalPercentage += percentage;
    const splitAmount = Math.round((amount * (percentage / 100)) * 100) / 100;
    splits.push({ userId: user.id, amount: splitAmount });
  }

  return { splits, totalPercentage: Math.round(totalPercentage * 100) / 100 };
}

function buildShareSplits(amount, splitPairs, userMap) {
  const validPairs = [];
  let totalShares = 0;

  for (const pair of splitPairs) {
    const user = userMap.get(normalizeUserName(pair.name));
    if (!user) continue;

    const shares = Number(pair.value);
    totalShares += shares;
    validPairs.push({ userId: user.id, shares });
  }

  if (!totalShares) return { splits: [], totalShares: 0 };

  const splits = [];
  let allocated = 0;

  validPairs.forEach((pair, index) => {
    const ratio = pair.shares / totalShares;
    const splitAmount = index === validPairs.length - 1
      ? Math.round((amount - allocated) * 100) / 100
      : Math.round((amount * ratio) * 100) / 100;

    allocated += splitAmount;
    splits.push({ userId: pair.userId, amount: splitAmount });
  });

  return { splits, totalShares };
}

async function importCSV(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({ message: 'groupId is required for CSV import' });
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
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const rows = await parseCSVData(req.file.buffer);
    const processedRows = rows.map((row, index) => ({
      ...row,
      _rowNum: index + 2,
      amountNumeric: parseAmount(row.amount),
      normalizedPaidBy: normalizeUserName(row.paid_by),
      parsedDate: parseDate(row.date)
    }));

    const anomalyRecords = [];
    let importedCount = 0;
    let skippedCount = 0;
    let flaggedCount = 0;

    const seenRows = [];

    for (const row of processedRows) {
      const anomalies = [];
      const rowDescription = String(row.description || '').trim();
      const rowNotes = String(row.notes || '').trim();
      const isSettlement = isSettlementRow(row);

      if (!row.paid_by || !String(row.paid_by).trim()) {
        anomalies.push({
          field: 'paid_by',
          issue: 'PAID_BY_MISSING',
          action: 'SKIPPED',
          originalVal: row.paid_by || '',
          resolvedVal: null,
          description: rowDescription
        });
      }

      if (!row.normalizedPaidBy && String(row.paid_by || '').trim()) {
        anomalies.push({
          field: 'paid_by',
          issue: 'PAID_BY_AMBIGUOUS',
          action: 'FLAGGED',
          originalVal: String(row.paid_by).trim(),
          resolvedVal: null,
          description: rowDescription
        });
      }

      if (row.paid_by && row.normalizedPaidBy && String(row.paid_by).trim() !== row.normalizedPaidBy) {
        anomalies.push({
          field: 'paid_by',
          issue: 'PAID_BY_CASE',
          action: 'IMPORTED',
          originalVal: String(row.paid_by).trim(),
          resolvedVal: row.normalizedPaidBy,
          description: rowDescription
        });
      }

      if (typeof row.amount === 'string' && row.amount.includes(',')) {
        anomalies.push({
          field: 'amount',
          issue: 'AMOUNT_FORMAT',
          action: 'IMPORTED',
          originalVal: row.amount,
          resolvedVal: String(row.amount).replace(/,/g, ''),
          description: rowDescription
        });
      }

      if (row.amountNumeric !== null && row.amountNumeric < 0 && !isSettlement) {
        anomalies.push({
          field: 'amount',
          issue: 'NEGATIVE_AMOUNT',
          action: 'FLAGGED',
          originalVal: String(row.amount),
          resolvedVal: null,
          description: rowDescription
        });
      }

      if (!row.currency || !String(row.currency).trim()) {
        anomalies.push({
          field: 'currency',
          issue: 'CURRENCY_MISSING',
          action: 'IMPORTED',
          originalVal: row.currency || '',
          resolvedVal: 'INR',
          description: rowDescription
        });
        row.currency = 'INR';
      }

      if (String(row.currency || '').toUpperCase() === 'USD') {
        anomalies.push({
          field: 'currency',
          issue: 'CURRENCY_USD',
          action: 'CONVERTED',
          originalVal: 'USD',
          resolvedVal: 'USD converted at 83 INR',
          description: rowDescription
        });
      }

      if (isSettlement) {
        anomalies.push({
          field: 'split_type',
          issue: 'SETTLEMENT_ROW',
          action: 'RECLASSIFIED',
          originalVal: row.split_type || 'none',
          resolvedVal: 'Settlement',
          description: rowDescription
        });
      }

      const exactDuplicate = findExactDuplicate(row, seenRows);
      if (exactDuplicate) {
        anomalies.push({
          field: 'record',
          issue: 'DUPLICATE_EXACT',
          action: 'SKIPPED',
          originalVal: `Matches row ${exactDuplicate._rowNum}`,
          resolvedVal: null,
          description: rowDescription
        });
      }

      const conflictDuplicate = findConflictDuplicate(row, seenRows);
      if (conflictDuplicate) {
        anomalies.push({
          field: 'record',
          issue: 'DUPLICATE_CONFLICT',
          action: 'FLAGGED',
          originalVal: `Conflicts with row ${conflictDuplicate._rowNum}`,
          resolvedVal: null,
          description: rowDescription
        });
      }

      const splitMembers = parseSplitList(row.split_with);
      const splitPairs = parseSplitDetailPairs(row.split_details);
      const unknownMembers = splitMembers.filter((member) => !normalizeUserName(member));

      if (unknownMembers.length > 0) {
        anomalies.push({
          field: 'split_with',
          issue: 'UNKNOWN_MEMBER_IN_SPLIT',
          action: 'FLAGGED',
          originalVal: unknownMembers.join('; '),
          resolvedVal: `Excluded: ${unknownMembers.join(', ')}`,
          description: rowDescription
        });
      }

      if (String(row.split_type || '').toLowerCase() === 'percentage' && splitPairs.length > 0) {
        const sum = splitPairs.reduce((total, pair) => total + Number(pair.value || 0), 0);
        if (Math.abs(sum - 100) > 0.01) {
          anomalies.push({
            field: 'split_details',
            issue: 'PERCENTAGE_INVALID',
            action: 'FLAGGED',
            originalVal: `Sum = ${sum}%`,
            resolvedVal: null,
            description: rowDescription
          });
        }
      }

      const hasFlagged = anomalies.some((item) => item.action === 'FLAGGED');
      const hasSkipped = anomalies.some((item) => item.action === 'SKIPPED');

      anomalyRecords.push(
        ...anomalies.map((item) => ({
          rowNumber: row._rowNum,
          field: item.field,
          issue: item.issue,
          action: item.action,
          originalVal: item.originalVal,
          resolvedVal: item.resolvedVal,
          description: item.description
        }))
      );

      if (hasFlagged) {
        flaggedCount += 1;
        seenRows.push(row);
        continue;
      }

      if (hasSkipped) {
        skippedCount += 1;
        seenRows.push(row);
        continue;
      }

      const paidByName = row.normalizedPaidBy;
      const paidByUser = await ensureUserByName(paidByName);

      if (!paidByUser) {
        anomalyRecords.push({
          rowNumber: row._rowNum,
          field: 'paid_by',
          issue: 'USER_NOT_FOUND',
          action: 'SKIPPED',
          originalVal: row.paid_by,
          resolvedVal: null,
          description: rowDescription
        });
        skippedCount += 1;
        seenRows.push(row);
        continue;
      }

      await ensureGroupMember(groupId, paidByUser.id, row.parsedDate || new Date());

      const currency = String(row.currency || 'INR').toUpperCase();
      const originalAmount = currency === 'USD' ? Number(row.amountNumeric) : null;
      const exchangeRate = currency === 'USD' ? USD_TO_INR : null;
      const finalAmount = currency === 'USD'
        ? Math.round((Number(row.amountNumeric) * USD_TO_INR) * 100) / 100
        : Math.round(Number(row.amountNumeric) * 100) / 100;

      if (isSettlement) {
        const payeeName = splitMembers[0] ? normalizeUserName(splitMembers[0]) : null;
        if (!payeeName) {
          anomalyRecords.push({
            rowNumber: row._rowNum,
            field: 'split_with',
            issue: 'PAYEE_NOT_FOUND',
            action: 'SKIPPED',
            originalVal: row.split_with || '',
            resolvedVal: null,
            description: rowDescription
          });
          skippedCount += 1;
          seenRows.push(row);
          continue;
        }

        const payeeUser = await ensureUserByName(payeeName);
        if (!payeeUser) {
          anomalyRecords.push({
            rowNumber: row._rowNum,
            field: 'split_with',
            issue: 'PAYEE_NOT_FOUND',
            action: 'SKIPPED',
            originalVal: row.split_with || '',
            resolvedVal: null,
            description: rowDescription
          });
          skippedCount += 1;
          seenRows.push(row);
          continue;
        }

        await ensureGroupMember(groupId, payeeUser.id, row.parsedDate || new Date());

        await prisma.settlement.create({
          data: {
            payerId: paidByUser.id,
            payeeId: payeeUser.id,
            groupId,
            amount: Math.abs(finalAmount),
            settledAt: row.parsedDate || new Date(),
            importedRow: row._rowNum
          }
        });

        importedCount += 1;
        seenRows.push(row);
        continue;
      }

      const splitType = String(row.split_type || 'equal').toLowerCase();
      const splitUserNames = splitMembers.length > 0 ? splitMembers : [paidByName];
      const splitUsers = [];

      for (const splitUserName of splitUserNames) {
        const canonicalName = normalizeUserName(splitUserName);
        if (!canonicalName) continue;

        const user = await ensureUserByName(canonicalName);
        if (!user) continue;

        await ensureGroupMember(groupId, user.id, row.parsedDate || new Date());
        splitUsers.push(user);
      }

      if (!splitUsers.length) {
        anomalyRecords.push({
          rowNumber: row._rowNum,
          field: 'split_with',
          issue: 'UNKNOWN_MEMBER_IN_SPLIT',
          action: 'FLAGGED',
          originalVal: row.split_with || '',
          resolvedVal: null,
          description: rowDescription
        });
        flaggedCount += 1;
        seenRows.push(row);
        continue;
      }

      const userMap = new Map(splitUsers.map((user) => [user.name, user]));
      let splits = [];

      if (splitType === 'equal') {
        splits = buildEqualSplits(finalAmount, splitUsers.map((user) => user.id));
      } else if (splitType === 'unequal') {
        const result = buildUnequalSplits(finalAmount, splitPairs, userMap);
        splits = result.splits;
        if (Math.abs(result.total - finalAmount) > 0.01) {
          anomalyRecords.push({
            rowNumber: row._rowNum,
            field: 'split_details',
            issue: 'UNEQUAL_TOTAL_INVALID',
            action: 'FLAGGED',
            originalVal: `Sum = ${result.total}`,
            resolvedVal: null,
            description: rowDescription
          });
          flaggedCount += 1;
          seenRows.push(row);
          continue;
        }
      } else if (splitType === 'percentage') {
        const result = buildPercentageSplits(finalAmount, splitPairs, userMap);
        splits = result.splits;
        if (Math.abs(result.totalPercentage - 100) > 0.01) {
          anomalyRecords.push({
            rowNumber: row._rowNum,
            field: 'split_details',
            issue: 'PERCENTAGE_INVALID',
            action: 'FLAGGED',
            originalVal: `Sum = ${result.totalPercentage}%`,
            resolvedVal: null,
            description: rowDescription
          });
          flaggedCount += 1;
          seenRows.push(row);
          continue;
        }
      } else if (splitType === 'share') {
        const result = buildShareSplits(finalAmount, splitPairs, userMap);
        splits = result.splits;
        if (!result.totalShares) {
          anomalyRecords.push({
            rowNumber: row._rowNum,
            field: 'split_details',
            issue: 'SHARE_INVALID',
            action: 'FLAGGED',
            originalVal: row.split_details || '',
            resolvedVal: null,
            description: rowDescription
          });
          flaggedCount += 1;
          seenRows.push(row);
          continue;
        }
      }

      await prisma.expense.create({
        data: {
          groupId,
          paidById: paidByUser.id,
          description: rowDescription,
          amount: finalAmount,
          originalAmount,
          originalCurrency: currency === 'USD' ? 'USD' : null,
          exchangeRate,
          splitType,
          expenseDate: row.parsedDate || new Date(),
          importedRow: row._rowNum,
          splits: {
            create: splits.map((split) => ({
              userId: split.userId,
              amount: split.amount
            }))
          }
        }
      });

      importedCount += 1;
      seenRows.push(row);
    }

    const importLog = await prisma.importLog.create({
      data: {
        totalRows: processedRows.length,
        imported: importedCount,
        skipped: skippedCount,
        flagged: flaggedCount,
        reportJson: JSON.stringify({
          groupId,
          summary: {
            total: processedRows.length,
            imported: importedCount,
            skipped: skippedCount,
            flagged: flaggedCount
          },
          anomalies: anomalyRecords
        })
      }
    });

    if (anomalyRecords.length > 0) {
      await prisma.importAnomaly.createMany({
        data: anomalyRecords.map((record) => ({
          importLogId: importLog.id,
          rowNumber: record.rowNumber,
          field: record.field,
          issue: record.issue,
          action: record.action,
          originalVal: record.originalVal,
          resolvedVal: record.resolvedVal
        }))
      });
    }

    return res.status(200).json({
      message: 'CSV imported successfully',
      importLog: {
        id: importLog.id,
        totalRows: importLog.totalRows,
        imported: importLog.imported,
        skipped: importLog.skipped,
        flagged: importLog.flagged,
        anomalies: anomalyRecords
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to import CSV',
      error: error.message
    });
  }
}

module.exports = {
  importCSV,
  normalizeUserName,
  parseCSVData,
  parseDate,
  parseAmount,
  parseSplitList,
  parseSplitDetailPairs
};
