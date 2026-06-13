const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const { importCSV } = require('../controllers/importController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

router.use(auth);

router.post('/', upload.single('file'), importCSV);

module.exports = router;
