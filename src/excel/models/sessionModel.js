const crypto = require('crypto');
const { getDb } = require('./database');

/**
 * Creates a new session in the database for a user.
 * @param {number} userId 
 * @returns {string} The cryptographically secure session token.
 */
function createSession(userId) {
    const db = getDb();
    const token = crypto.randomBytes(32).toString('hex');
    // Set session expiry to 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const stmt = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
        stmt.run(token, userId, expiresAt);
        return token;
    } catch (err) {
        console.error(`[Session Model] Error creating session for user ${userId}:`, err);
        throw err;
    }
}

/**
 * Retrieves and validates a session.
 * If expired, it deletes the session and returns null.
 * @param {string} token 
 * @returns {object|null} The session record containing user_id, or null if invalid/expired.
 */
function getSession(token) {
    if (!token) return null;
    const db = getDb();

    try {
        const stmt = db.prepare('SELECT * FROM sessions WHERE token = ?');
        const session = stmt.get(token);

        if (!session) return null;

        const now = new Date();
        const expiresAt = new Date(session.expires_at);

        if (now > expiresAt) {
            // Session has expired, clean it up
            deleteSession(token);
            return null;
        }

        return session;
    } catch (err) {
        console.error('[Session Model] Error getting session:', err);
        return null;
    }
}

/**
 * Deletes a session (logs out).
 * @param {string} token 
 * @returns {boolean} True if deleted.
 */
function deleteSession(token) {
    if (!token) return false;
    const db = getDb();

    try {
        const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
        const result = stmt.run(token);
        return result.changes > 0;
    } catch (err) {
        console.error('[Session Model] Error deleting session:', err);
        return false;
    }
}

/**
 * Cleans up all expired sessions in the database.
 */
function cleanExpiredSessions() {
    const db = getDb();
    try {
        const now = new Date().toISOString();
        const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
        const result = stmt.run(now);
        if (result.changes > 0) {
            console.log(`[Session Model] Cleaned up ${result.changes} expired sessions.`);
        }
    } catch (err) {
        console.error('[Session Model] Error cleaning expired sessions:', err);
    }
}

module.exports = {
    createSession,
    getSession,
    deleteSession,
    cleanExpiredSessions
};
