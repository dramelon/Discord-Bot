const crypto = require('crypto');
const { getDb } = require('./database');

/**
 * Hashes a plain password using scrypt with a random salt.
 * @param {string} password 
 * @returns {{salt: string, hash: string}}
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

/**
 * Verifies a plain password against the stored salt and hash.
 * @param {string} password 
 * @param {string} salt 
 * @param {string} hash 
 * @returns {boolean}
 */
function verifyPassword(password, salt, hash) {
    const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return checkHash === hash;
}

/**
 * Creates a new user in the database.
 * @param {string} username 
 * @param {string} password 
 * @returns {number|null} The inserted user's ID, or null on failure.
 */
function createUser(username, password) {
    const db = getDb();
    const { salt, hash } = hashPassword(password);
    
    try {
        const stmt = db.prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)');
        const result = stmt.run(username.toLowerCase(), hash, salt);
        return result.lastInsertRowid;
    } catch (err) {
        console.error(`[User Model] Error creating user ${username}:`, err);
        return null;
    }
}

/**
 * Retrieves a user by their username.
 * @param {string} username 
 * @returns {object|null} The user record or null if not found.
 */
function getUserByUsername(username) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        const user = stmt.get(username.toLowerCase());
        return user || null;
    } catch (err) {
        console.error(`[User Model] Error getting user ${username}:`, err);
        return null;
    }
}

/**
 * Updates a user's password.
 * @param {number} userId 
 * @param {string} newPassword 
 * @returns {boolean} True if successful.
 */
function updateUserPassword(userId, newPassword) {
    const db = getDb();
    const { salt, hash } = hashPassword(newPassword);
    
    try {
        const stmt = db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?');
        const result = stmt.run(hash, salt, userId);
        return result.changes > 0;
    } catch (err) {
        console.error(`[User Model] Error updating password for user ID ${userId}:`, err);
        return false;
    }
}

/**
 * Counts total number of users in database.
 * @returns {number} The count.
 */
function countUsers() {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
        const row = stmt.get();
        return row ? row.count : 0;
    } catch (err) {
        console.error('[User Model] Error counting users:', err);
        return 0;
    }
}

module.exports = {
    createUser,
    getUserByUsername,
    updateUserPassword,
    countUsers,
    verifyPassword
};
