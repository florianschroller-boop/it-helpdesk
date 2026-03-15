const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/database');

const SECRET = () => process.env.APP_SECRET_KEY || 'dev-secret-change-me';

/**
 * Available roles (combinable):
 *   admin       — Full access, system configuration
 *   agent       — Ticket processing, asset management, KB editing
 *   disposition — Like user, but can assign/reassign tickets to agents
 *   assistenz   — Can create tickets on behalf of users in own department
 *   user        — Self-service, own tickets only
 */
const ALL_ROLES = ['admin', 'agent', 'disposition', 'assistenz', 'user'];

// Parse role string into array: "agent,disposition" → ['agent','disposition']
function parseRoles(roleStr) {
  if (!roleStr) return ['user'];
  return roleStr.split(',').map(r => r.trim().toLowerCase()).filter(r => ALL_ROLES.includes(r));
}

// Check if user has at least one of the required roles
function hasRole(userRoles, ...requiredRoles) {
  if (!Array.isArray(userRoles)) userRoles = parseRoles(userRoles);
  // admin always has access
  if (userRoles.includes('admin')) return true;
  return requiredRoles.some(r => userRoles.includes(r));
}

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

// Auth middleware
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

    // Parse roles into array for easy checking
    user.roles = parseRoles(user.role);

    // Convenience flags
    user.isAdmin = user.roles.includes('admin');
    user.isAgent = user.roles.includes('agent') || user.isAdmin;
    user.isDisposition = user.roles.includes('disposition') || user.isAdmin;
    user.isAssistenz = user.roles.includes('assistenz');

    // Backward compatibility: primary role for frontend display
    if (user.isAdmin) user.primaryRole = 'admin';
    else if (user.roles.includes('agent')) user.primaryRole = 'agent';
    else user.primaryRole = 'user';

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Sitzung abgelaufen' });
    }
    return res.status(401).json({ success: false, error: 'Ungültiges Token' });
  }
}

// Role-based access — checks if user has ANY of the specified roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
    }
    if (hasRole(req.user.roles, ...roles)) {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
  };
}

module.exports = { generateToken, verifyToken, authenticate, requireRole, parseRoles, hasRole, ALL_ROLES };
