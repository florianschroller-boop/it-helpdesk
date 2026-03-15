const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, queryOne, insert } = require('../config/database');
const { generateToken } = require('../middleware/auth');

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-Mail und Passwort erforderlich' });
    }

    const user = await queryOne('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten' });
    }

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24h
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          phone: user.phone,
          avatar_url: user.avatar_url
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/auth/logout
async function logout(req, res) {
  res.clearCookie('token');
  res.json({ success: true });
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ success: true, data: req.user });
}

// GET /api/auth/me/assets — user's own assigned devices
async function myAssets(req, res) {
  try {
    const assets = await query(
      'SELECT a.*, u.name as assigned_to_name FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id WHERE a.assigned_to_user_id = ? ORDER BY a.name',
      [req.user.id]
    );
    res.json({ success: true, data: assets });
  } catch {
    res.json({ success: true, data: [] });
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'E-Mail erforderlich' });
    }

    const user = await queryOne('SELECT id FROM users WHERE email = ? AND active = 1', [email]);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'Falls die E-Mail existiert, wurde ein Link versendet.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await insert(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
      [resetToken, expires, user.id]
    );

    // TODO: Send email with reset link in Phase 3
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({ success: true, message: 'Falls die E-Mail existiert, wurde ein Link versendet.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/auth/change-password (authenticated)
async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Aktuelles und neues Passwort erforderlich' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, error: 'Neues Passwort muss mindestens 8 Zeichen lang sein' });
    }

    const user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ success: false, error: 'Aktuelles Passwort ist falsch' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await insert('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

    res.json({ success: true, message: 'Passwort geändert' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { first_name, last_name, email, password, department, location, invite_key } = req.body;

    if (!first_name || !last_name || !email || !password || !invite_key) {
      return res.status(400).json({ success: false, error: 'Alle Pflichtfelder ausfüllen' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Passwort muss mindestens 8 Zeichen lang sein' });
    }

    // Check registration enabled
    const regEnabled = await queryOne("SELECT value FROM settings WHERE key_name = 'wl_registration_enabled'");
    if (!regEnabled || regEnabled.value !== 'true') {
      return res.status(403).json({ success: false, error: 'Registrierung ist deaktiviert' });
    }

    // Validate invite key
    const key = await queryOne(
      "SELECT * FROM invite_keys WHERE key_code = ? AND active = 1",
      [invite_key.toUpperCase().trim()]
    );

    if (!key) {
      return res.status(400).json({ success: false, error: 'Ungültiger Einladungsschlüssel' });
    }
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Einladungsschlüssel ist abgelaufen' });
    }
    if (key.max_uses && key.uses >= key.max_uses) {
      return res.status(400).json({ success: false, error: 'Einladungsschlüssel wurde bereits zu oft verwendet' });
    }

    // Check email unique
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'E-Mail-Adresse bereits registriert' });
    }

    // Create user
    const name = `${first_name.trim()} ${last_name.trim()}`;
    const hash = await bcrypt.hash(password, 12);

    await insert(
      'INSERT INTO users (name, email, password_hash, role, department, location) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hash, 'user', department || null, location || null]
    );

    // Increment key usage
    await insert('UPDATE invite_keys SET uses = uses + 1 WHERE id = ?', [key.id]);

    console.log(`[REGISTER] New user: ${email} (key: ${key.key_code})`);

    // Auto-login
    const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, location: user.location }
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/auth/branding — public, no auth required
async function getBranding(req, res) {
  try {
    const rows = await query("SELECT key_name, value FROM settings WHERE key_name LIKE 'wl_%'");
    const branding = {};
    for (const r of rows) {
      const key = r.key_name.replace('wl_', '');
      branding[key] = r.value;
    }
    // Also include departments for registration form
    const deptRow = await queryOne("SELECT value FROM settings WHERE key_name = 'departments'");
    branding.departments = deptRow ? JSON.parse(deptRow.value) : [];

    // Locations
    const locations = await query("SELECT name FROM locations WHERE active = 1 ORDER BY sort_order, name");
    branding.locations = locations.map(l => l.name);

    res.json({ success: true, data: branding });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// ---- Microsoft OAuth ----

const MicrosoftOAuth = require('../services/MicrosoftOAuth');

// Pending states (in-memory, short-lived)
const _oauthStates = new Map();

// GET /api/auth/microsoft/status — check if MS login is enabled
function microsoftStatus(req, res) {
  res.json({ success: true, data: { enabled: MicrosoftOAuth.enabled } });
}

// GET /api/auth/microsoft — redirect to Microsoft login
function microsoftRedirect(req, res) {
  if (!MicrosoftOAuth.enabled) {
    return res.status(400).json({ success: false, error: 'Microsoft-Login ist nicht konfiguriert' });
  }

  const state = MicrosoftOAuth.generateState();
  _oauthStates.set(state, { created: Date.now() });

  // Clean up old states (>10 min)
  for (const [key, val] of _oauthStates) {
    if (Date.now() - val.created > 600000) _oauthStates.delete(key);
  }

  const authUrl = MicrosoftOAuth.getAuthUrl(state);
  res.redirect(authUrl);
}

// GET /api/auth/microsoft/callback — handle OAuth callback
async function microsoftCallback(req, res) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('Microsoft OAuth error:', oauthError, req.query.error_description);
      return res.redirect(`${appUrl}/#/login?error=oauth_denied`);
    }

    if (!code || !state) {
      return res.redirect(`${appUrl}/#/login?error=oauth_invalid`);
    }

    // Validate state
    if (!_oauthStates.has(state)) {
      return res.redirect(`${appUrl}/#/login?error=oauth_state`);
    }
    _oauthStates.delete(state);

    // Exchange code for tokens
    const tokens = await MicrosoftOAuth.exchangeCode(code);

    // Get user profile from Microsoft Graph
    const profile = await MicrosoftOAuth.getUserProfile(tokens.access_token);

    if (!profile.email) {
      return res.redirect(`${appUrl}/#/login?error=oauth_no_email`);
    }

    // Find or create user
    let user = await queryOne('SELECT * FROM users WHERE email = ? AND active = 1', [profile.email]);

    if (!user) {
      // Auto-create user with a random password (they'll use OAuth to log in)
      const randomPw = require('crypto').randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(randomPw, 12);

      await insert(
        'INSERT INTO users (name, email, password_hash, role, department, location, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [profile.name, profile.email, hash, 'user', profile.department, profile.officeLocation, profile.phone]
      );

      user = await queryOne('SELECT * FROM users WHERE email = ?', [profile.email]);
      console.log(`[MS-OAUTH] Auto-created user: ${profile.email}`);
    } else {
      // Update profile info from Microsoft if fields are empty
      const updates = [];
      const params = [];
      if (!user.department && profile.department) { updates.push('department = ?'); params.push(profile.department); }
      if (!user.location && profile.officeLocation) { updates.push('location = ?'); params.push(profile.officeLocation); }
      if (!user.phone && profile.phone) { updates.push('phone = ?'); params.push(profile.phone); }
      if (updates.length > 0) {
        params.push(user.id);
        await insert(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    }

    // Generate JWT
    const token = generateToken(user);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    console.log(`[MS-OAUTH] Login: ${profile.email} (${user.role})`);

    // Redirect to app
    res.redirect(`${appUrl}/#/dashboard`);

  } catch (err) {
    console.error('Microsoft OAuth callback error:', err);
    res.redirect(`${appUrl}/#/login?error=oauth_failed`);
  }
}

module.exports = { login, logout, me, myAssets, resetPassword, changePassword, register, getBranding, microsoftRedirect, microsoftCallback, microsoftStatus };
