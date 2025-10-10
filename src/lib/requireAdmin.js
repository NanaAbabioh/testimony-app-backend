// Admin authentication for Railway backend
const crypto = require('crypto');

const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'ah-admin-secret-2025';

/**
 * Verify signed admin token
 * @param {string} token - Token to verify
 * @returns {boolean} True if valid
 */
function verifyToken(token) {
  if (!token) return false;

  try {
    const parts = token.split('.');

    if (parts.length !== 3) return false;

    const [tokenPart, timestamp, signature] = parts;

    if (!tokenPart || !timestamp || !signature) return false;

    // Check if token is expired (24 hours)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 24 * 60 * 60 * 1000) return false;

    // Verify signature
    const payload = `${tokenPart}.${timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
  } catch (error) {
    return false;
  }
}

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

  if (!verifyToken(token)) {
    throw new Error('Unauthorized: Invalid or expired token');
  }

  return { uid: 'admin', email: 'admin@alphahour.com' };
}

module.exports = { requireAdmin, verifyToken };
