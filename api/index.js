require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { testConnection } = require('./config/database');

const app = express();
const PORT = process.env.APP_PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// DEBUG: Log all requests
app.use((req, res, next) => {
  if (req.path === '/api/user/devices') {
    console.log('[DEBUG] HIT /api/user/devices method=' + req.method);
    const { authenticate } = require('./middleware/auth');
    authenticate(req, res, async () => {
      try {
        const { query: dbq } = require('./config/database');
        const assets = await dbq('SELECT a.*, u.name as assigned_to_name FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id WHERE a.assigned_to_user_id = ? ORDER BY a.name', [req.user.id]);
        res.json({ success: true, data: assets });
      } catch { res.json({ success: true, data: [] }); }
    });
    return;
  }
  next();
});

// Static files (plugins are synced to public/plugins/ by PluginManager) — no cache for HTML/JS/CSS to avoid stale code
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Upload files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/tickets', require('./routes/tickets'));
// Assets removed — available as plugin. My-assets route is in auth router.
app.use('/api/orders', require('./routes/orders'));
// Network monitor removed — available as plugin 'network-monitor'
app.use('/api/kb', require('./routes/kb'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/templates', require('./routes/templates'));
// Onboarding removed — available as plugin 'onboarding-offboarding'
app.use('/api/mailhook', require('./routes/mailhook'));
app.use('/api/invites', require('./routes/invites'));

// SPA fallback and error handler are registered AFTER plugin loading in start()

// Start
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('Cannot connect to database. Check your .env configuration.');
    process.exit(1);
  }
  console.log('Database connected.');

  // Load plugins BEFORE SPA fallback
  const PluginManager = require('./services/PluginManager');
  await PluginManager.loadAll(app);

  // SPA fallback — AFTER all routes (including plugin routes) are registered
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/plugins/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    if (req.path.includes('.')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  });

  app.listen(PORT, () => {
    console.log(`Helpdesk server running at http://localhost:${PORT}`);
  });

  // Start IMAP email poller
  const EmailPoller = require('./services/EmailPoller');
  EmailPoller.start();

  // Network monitor removed — now handled by network-monitor plugin if installed
}

start();
