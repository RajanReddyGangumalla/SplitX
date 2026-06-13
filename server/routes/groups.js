const express = require('express');
const auth = require('../middleware/auth');
const {
  createGroup,
  getMyGroups,
  getGroupById,
  addMemberByEmail,
  removeMember
} = require('../controllers/groupController');

const router = express.Router();

router.use(auth);

router.post('/', createGroup);
router.get('/', getMyGroups);
router.get('/:id', getGroupById);
router.post('/:id/members', addMemberByEmail);
router.delete('/:id/members/:userId', removeMember);

module.exports = router;
