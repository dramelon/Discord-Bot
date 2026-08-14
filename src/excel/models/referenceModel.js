const { getDb } = require('./database');

/**
 * Checks if a reference lookup table belongs to the user.
 * @param {number} userId 
 * @param {number} referenceId 
 * @returns {boolean}
 */
function verifyReferenceOwner(userId, referenceId) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT 1 FROM "references" WHERE id = ? AND user_id = ?');
        const row = stmt.get(referenceId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

/**
 * Gets all reference lookup tables for a user.
 * @param {number} userId 
 * @returns {Array<object>}
 */
function getReferences(userId) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT * FROM "references" WHERE user_id = ? ORDER BY name ASC');
        return stmt.all(userId);
    } catch (err) {
        console.error('[Reference Model] Error getting references:', err);
        return [];
    }
}

/**
 * Creates a new reference lookup table.
 * @param {number} userId 
 * @param {string} name 
 * @returns {object|null} The created reference table details.
 */
function createReference(userId, name) {
    const db = getDb();
    try {
        const stmt = db.prepare('INSERT INTO "references" (user_id, name) VALUES (?, ?)');
        const result = stmt.run(userId, name.trim());
        return {
            id: result.lastInsertRowid,
            user_id: userId,
            name: name.trim()
        };
    } catch (err) {
        console.error('[Reference Model] Error creating reference:', err);
        return null;
    }
}

/**
 * Renames a reference lookup table.
 * @param {number} userId 
 * @param {number} id Reference ID
 * @param {string} name New name
 * @returns {boolean} True if updated.
 */
function updateReference(userId, id, name) {
    if (!verifyReferenceOwner(userId, id)) return false;
    const db = getDb();
    try {
        const stmt = db.prepare('UPDATE "references" SET name = ? WHERE id = ?');
        const result = stmt.run(name.trim(), id);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Reference Model] Error renaming reference ${id}:`, err);
        return false;
    }
}

/**
 * Deletes a reference lookup table.
 * @param {number} userId 
 * @param {number} id Reference ID
 * @returns {boolean} True if deleted.
 */
function deleteReference(userId, id) {
    if (!verifyReferenceOwner(userId, id)) return false;
    const db = getDb();
    try {
        const stmt = db.prepare('DELETE FROM "references" WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Reference Model] Error deleting reference ${id}:`, err);
        return false;
    }
}

/**
 * Gets all key-value items for a reference lookup table.
 * @param {number} userId 
 * @param {number} referenceId 
 * @returns {Array<object>}
 */
function getReferenceItems(userId, referenceId) {
    if (!verifyReferenceOwner(userId, referenceId)) return [];
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT id, key, value FROM reference_items WHERE reference_id = ? ORDER BY id ASC');
        return stmt.all(referenceId);
    } catch (err) {
        console.error(`[Reference Model] Error getting items for reference ${referenceId}:`, err);
        return [];
    }
}

/**
 * Saves/commits a bulk list of key-value items for a reference table in a single transaction.
 * @param {number} userId 
 * @param {number} referenceId 
 * @param {Array<object>} items [{ key, value }]
 * @returns {boolean} True if successful.
 */
function saveReferenceItems(userId, referenceId, items) {
    if (!verifyReferenceOwner(userId, referenceId)) return false;
    const db = getDb();

    try {
        const saveTransaction = db.transaction((refId, list) => {
            // 1. Delete all existing items for this reference list
            const deleteStmt = db.prepare('DELETE FROM reference_items WHERE reference_id = ?');
            deleteStmt.run(refId);

            // 2. Insert new list items
            const insertStmt = db.prepare('INSERT INTO reference_items (reference_id, key, value) VALUES (?, ?, ?)');
            list.forEach(item => {
                const k = item.key ? String(item.key).trim() : '';
                const v = item.value ? String(item.value).trim() : '';
                // Skip completely empty rows
                if (k !== '' || v !== '') {
                    insertStmt.run(refId, k, v);
                }
            });
        });

        saveTransaction(referenceId, items);
        return true;
    } catch (err) {
        console.error(`[Reference Model] Error bulk saving reference items for ${referenceId}:`, err);
        return false;
    }
}

/**
 * Creates a single reference item key-value pair.
 * @param {number} userId 
 * @param {number} referenceId 
 * @param {string} key 
 * @param {string} value 
 * @returns {object|null}
 */
function createReferenceItem(userId, referenceId, key = '', value = '') {
    if (!verifyReferenceOwner(userId, referenceId)) return null;
    const db = getDb();
    try {
        const stmt = db.prepare('INSERT INTO reference_items (reference_id, key, value) VALUES (?, ?, ?)');
        const result = stmt.run(referenceId, key, value);
        return {
            id: result.lastInsertRowid,
            reference_id: referenceId,
            key,
            value
        };
    } catch (err) {
        console.error('[Reference Model] Error creating reference item:', err);
        return null;
    }
}

module.exports = {
    verifyReferenceOwner,
    getReferences,
    createReference,
    updateReference,
    deleteReference,
    getReferenceItems,
    saveReferenceItems,
    createReferenceItem
};
