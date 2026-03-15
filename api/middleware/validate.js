// Simple input validation middleware

function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rule] of Object.entries(rules)) {
      const value = req.body[field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} ist erforderlich`);
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`${field} muss eine gültige E-Mail-Adresse sein`);
        }
        if (rule.minLength && String(value).length < rule.minLength) {
          errors.push(`${field} muss mindestens ${rule.minLength} Zeichen lang sein`);
        }
        if (rule.maxLength && String(value).length > rule.maxLength) {
          errors.push(`${field} darf maximal ${rule.maxLength} Zeichen lang sein`);
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`${field} muss einer der folgenden Werte sein: ${rule.enum.join(', ')}`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }
    next();
  };
}

// Sanitize string to prevent XSS
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

module.exports = { validateBody, sanitize };
