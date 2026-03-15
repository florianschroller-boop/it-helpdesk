const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

router.get('/', settingsController.getAll);
router.put('/', settingsController.update);
router.post('/test-email', settingsController.testEmail);
router.get('/email-logs', settingsController.getEmailLogs);
router.post('/test-imap', settingsController.testImap);

// Logo upload
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logoStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${uuidv4()}${ext}`);
  }
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Nur Bilddateien erlaubt'));
    cb(null, true);
  }
});

router.post('/upload-logo', logoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Keine Datei' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, data: { url } });
});

// POST /api/settings/restart — full restart: kill all node, relaunch
router.post('/restart', (req, res) => {
  res.json({ success: true, message: 'Server wird neu gestartet...' });

  setTimeout(() => {
    console.log('[RESTART] Admin-triggered restart — killing all node processes and relaunching');

    const { exec, spawn } = require('child_process');
    const path = require('path');
    const isWin = process.platform === 'win32';
    const rootDir = path.resolve(__dirname, '..', '..');
    const entryPoint = path.resolve(__dirname, '..', 'index.js');
    const myPid = process.pid;

    if (isWin) {
      // Write a small restart script that:
      // 1. Waits for current process to die
      // 2. Kills any remaining node on our port
      // 3. Starts fresh
      const restartBat = path.join(rootDir, '.restart.bat');
      const port = process.env.APP_PORT || '3000';
      const fs = require('fs');
      fs.writeFileSync(restartBat,
        `@echo off\r\n` +
        `timeout /t 2 /nobreak >nul\r\n` +
        `taskkill /F /PID ${myPid} >nul 2>&1\r\n` +
        `for /f "tokens=5" %%p in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1\r\n` +
        `timeout /t 1 /nobreak >nul\r\n` +
        `cd /d "${rootDir}"\r\n` +
        `start "" node "${entryPoint}"\r\n` +
        `del "%~f0"\r\n`
      );
      spawn('cmd.exe', ['/c', restartBat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else {
      // Linux/Mac: kill all node on our port, then relaunch
      const port = process.env.APP_PORT || '3000';
      const restartSh = path.join(rootDir, '.restart.sh');
      const fs = require('fs');
      fs.writeFileSync(restartSh,
        `#!/bin/bash\nsleep 2\nkill ${myPid} 2>/dev/null\nfuser -k ${port}/tcp 2>/dev/null\nsleep 1\ncd "${rootDir}"\nnohup node "${entryPoint}" > /dev/null 2>&1 &\nrm -f "${restartSh}"\n`
      );
      fs.chmodSync(restartSh, '755');
      spawn('bash', [restartSh], { detached: true, stdio: 'ignore' }).unref();
    }

    // Exit this process
    process.exit(0);
  }, 500);
});

module.exports = router;
