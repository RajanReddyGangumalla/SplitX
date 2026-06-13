const express = require('express');
const auth = require('../middleware/auth');
const {
  createExpense,
  getGroupExpenses,
  getExpenseById,
  deleteExpense
} = require('../controllers/expenseController');

const router = express.Router();

router.use(auth);

router.post('/groups/:id/expenses', createExpense);
router.get('/groups/:id/expenses', getGroupExpenses);
router.get('/expenses/:id', getExpenseById);
router.delete('/expenses/:id', deleteExpense);

module.exports = router;
