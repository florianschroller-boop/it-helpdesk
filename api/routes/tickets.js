const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticate } = require('../middleware/auth');

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.UPLOAD_MAX_SIZE_MB) || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Block dangerous extensions
    const blocked = ['.exe', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.msi'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      return cb(new Error('Dateityp nicht erlaubt'));
    }
    cb(null, true);
  }
});

router.use(authenticate);

router.get('/', ticketController.list);
router.get('/stats', ticketController.stats);
router.post('/', ticketController.create);
router.get('/:id', ticketController.getById);
router.put('/:id', ticketController.update);
router.get('/:id/comments', ticketController.getComments);
router.post('/:id/comments', ticketController.addComment);
router.get('/:id/history', ticketController.getHistory);
router.get('/:id/attachments', ticketController.getAttachments);
router.post('/:id/attachments', upload.single('file'), ticketController.addAttachment);

module.exports = router;
