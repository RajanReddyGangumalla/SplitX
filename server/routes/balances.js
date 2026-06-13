const express = require('express');
const auth = require('../middleware/auth');
const {
  getGroupBalances,
  getExpenseBreakdown,
  getUserBalances,
  recordSettlement,
  getGroupSettlements
} = require('../controllers/balanceController');

const router = express.Router();

router.use(auth);

router.get('/groups/:id/balances', getGroupBalances);
router.get('/expenses/:id/breakdown', getExpenseBreakdown);
router.get('/users/me/balances', getUserBalances);
router.post('/settlements', recordSettlement);
router.get('/groups/:id/settlements', getGroupSettlements);

module.exports = router;
