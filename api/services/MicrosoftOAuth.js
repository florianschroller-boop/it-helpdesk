/**
 * Microsoft OAuth 2.0 / OpenID Connect Service
 * Uses Azure AD / Entra ID authorization code flow.
 * No external dependencies — uses native fetch + crypto.
 */

const crypto = require('crypto');

class MicrosoftOAuth {
  get enabled() {
    return process.env.MS_OAUTH_ENABLED === 'true' && !!process.env.MS_OAUTH_CLIENT_ID;
  }

  get config() {
    const tenantId = process.env.MS_OAUTH_TENANT_ID || 'common';
    return {
      clientId: process.env.MS_OAUTH_CLIENT_ID,
      clientSecret: process.env.MS_OAUTH_CLIENT_SECRET,
      tenantId,
      redirectUri: process.env.MS_OAUTH_REDIRECT_URI || `${process.env.APP_URL}/api/auth/microsoft/callback`,
      authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      scope: 'openid profile email User.Read'
    };
  }

  // Generate authorization URL with state parameter
  getAuthUrl(state) {
    const c = this.config;
    const params = new URLSearchParams({
      client_id: c.clientId,
      response_type: 'code',
      redirect_uri: c.redirectUri,
      scope: c.scope,
      response_mode: 'query',
      state,
      prompt: 'select_account'
    });
    return `${c.authorizeUrl}?${params.toString()}`;
  }

  // Generate a random state token
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Exchange authorization code for tokens
  async exchangeCode(code) {
    const c = this.config;

    const body = new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
      scope: c.scope
    });

    const response = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error_description || error.error || 'Token exchange failed');
    }

    return response.json();
  }

  // Get user profile from Microsoft Graph
  async getUserProfile(accessToken) {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Microsoft user profile');
    }

    const profile = await response.json();

    return {
      email: profile.mail || profile.userPrincipalName,
      name: profile.displayName || `${profile.givenName || ''} ${profile.surname || ''}`.trim(),
      department: profile.department || null,
      phone: profile.mobilePhone || profile.businessPhones?.[0] || null,
      officeLocation: profile.officeLocation || null,
      microsoftId: profile.id
    };
  }
}

module.exports = new MicrosoftOAuth();
