// Simple admin authentication for Railway backend
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';

/**
 * Verify admin authentication token
 * @param {string|undefined} authHeader - Authorization header
 * @returns {Promise<{uid: string, email: string}>} Admin user object
 * @throws {Error} If token is missing or invalid
 */
async function requireAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing auth token');
  }

  const token = authHeader.slice('Bearer '.length);

  if (token !== ADMIN_TOKEN) {
    throw new Error('Unauthorized: Invalid token');
  }

  return { uid: 'admin', email: 'admin@alphahour.com' };
}

module.exports = { requireAdmin };
