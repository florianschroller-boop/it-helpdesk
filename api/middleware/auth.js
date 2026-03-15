const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/database');

const SECRET = () => process.env.APP_SECRET_KEY || 'dev-secret-change-me';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET(),
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, SECRET());
}

// Auth middleware — checks JWT from cookie or Authorization header
async function authenticate(req, res, next) {
  try {
    let token = req.cookies?.token;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
    }

    const decoded = verifyToken(token);
    const user = await queryOne(
      'SELECT id, name, email, role, department, location, is_manager, phone, avatar_url, active FROM users WHERE id = ? AND active = 1',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Benutzer nicht gefunden oder deaktiviert' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Sitzung abgelaufen' });
    }
    return res.status(401).json({ success: false, error: 'Ungültiges Token' });
  }
}

// Role-based access
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
    }
    next();
  };
}

module.exports = { generateToken, verifyToken, authenticate, requireRole };
