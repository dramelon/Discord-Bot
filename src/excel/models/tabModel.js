const { getDb } = require('./database');
const { verifyWorkbookOwner } = require('./workbookModel');

/**
 * Checks if a tab belongs to a workbook owned by the user.
 * @param {number} userId 
 * @param {number} tabId 
 * @returns {boolean}
 */
function verifyTabOwner(userId, tabId) {
    const db = getDb();
    try {
        const stmt = db.prepare(`
            SELECT 1 FROM tabs t 
            JOIN workbooks w ON t.workbook_id = w.id 
            WHERE t.id = ? AND w.user_id = ?
        `);
        const row = stmt.get(tabId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

/**
 * Retrieves all tabs for a given workbook.
 * Verifies workbook ownership first.
 * @param {number} userId 
 * @param {number} workbookId 
 * @returns {Array<object>}
 */
function getTabsByWorkbookId(userId, workbookId) {
    if (!verifyWorkbookOwner(userId, workbookId)) return [];

    const db = getDb();
    try {
        const stmt = db.prepare('SELECT * FROM tabs WHERE workbook_id = ? ORDER BY id ASC');
        let tabs = stmt.all(workbookId);

        if (tabs.length === 0) {
            // Defensive: if somehow tabs got deleted, seed a default one
            const insertStmt = db.prepare('INSERT INTO tabs (workbook_id, name) VALUES (?, ?)');
            insertStmt.run(workbookId, 'Sheet 1');
            tabs = stmt.all(workbookId);
        }
        return tabs;
    } catch (err) {
        console.error(`[Tab Model] Error getting tabs for workbook ${workbookId}:`, err);
        return [];
    }
}

/**
 * Creates a new tab inside a workbook.
 * @param {number} userId 
 * @param {number} workbookId 
 * @param {string} name 
 * @returns {number|null} The created tab ID.
 */
function createTab(userId, workbookId, name) {
    if (!verifyWorkbookOwner(userId, workbookId)) return null;

    const db = getDb();
    try {
        const stmt = db.prepare('INSERT INTO tabs (workbook_id, name) VALUES (?, ?)');
        const result = stmt.run(workbookId, name.trim());
        return result.lastInsertRowid;
    } catch (err) {
        console.error(`[Tab Model] Error creating tab inside workbook ${workbookId}:`, err);
        return null;
    }
}

/**
 * Renames a tab.
 * @param {number} userId 
 * @param {number} id Tab ID
 * @param {string} name New name
 * @returns {boolean} True if updated.
 */
function updateTab(userId, id, name) {
    if (!verifyTabOwner(userId, id)) return false;

    const db = getDb();
    try {
        const stmt = db.prepare('UPDATE tabs SET name = ? WHERE id = ?');
        const result = stmt.run(name.trim(), id);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Tab Model] Error renaming tab ${id}:`, err);
        return false;
    }
}

/**
 * Deletes a tab.
 * @param {number} userId 
 * @param {number} id Tab ID
 * @returns {boolean} True if deleted.
 */
function deleteTab(userId, id) {
    if (!verifyTabOwner(userId, id)) return false;

    const db = getDb();
    try {
        const stmt = db.prepare('DELETE FROM tabs WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Tab Model] Error deleting tab ${id}:`, err);
        return false;
    }
}

module.exports = {
    getTabsByWorkbookId,
    createTab,
    updateTab,
    deleteTab,
    verifyTabOwner
};
