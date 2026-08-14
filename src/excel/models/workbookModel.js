const { getDb } = require('./database');

/**
 * Retrieves all workbooks for a user.
 * If the user has no workbooks, automatically seeds a default one and returns it.
 * @param {number} userId 
 * @returns {Array<object>}
 */
function getWorkbooksByUserId(userId) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT * FROM workbooks WHERE user_id = ? ORDER BY id ASC');
        let workbooks = stmt.all(userId);

        if (workbooks.length === 0) {
            console.log(`[Workbook Model] User ${userId} has no sheets. Seeding "Excel Sheet1"...`);
            const defaultId = createWorkbook(userId, 'Excel Sheet1');
            if (defaultId) {
                workbooks = stmt.all(userId);
            }
        }
        return workbooks;
    } catch (err) {
        console.error(`[Workbook Model] Error getting workbooks for user ${userId}:`, err);
        return [];
    }
}

/**
 * Creates a new workbook and seeds a default tab ("Sheet 1") in it.
 * @param {number} userId 
 * @param {string} name 
 * @returns {number|null} The created workbook ID.
 */
function createWorkbook(userId, name) {
    const db = getDb();
    
    // Perform transaction to ensure workbook and its default tab are created together
    const insertTransaction = db.transaction((uId, wName) => {
        const wStmt = db.prepare('INSERT INTO workbooks (user_id, name) VALUES (?, ?)');
        const wResult = wStmt.run(uId, wName.trim());
        const workbookId = wResult.lastInsertRowid;

        const tStmt = db.prepare('INSERT INTO tabs (workbook_id, name) VALUES (?, ?)');
        tStmt.run(workbookId, 'Sheet 1');

        return workbookId;
    });

    try {
        return insertTransaction(userId, name);
    } catch (err) {
        console.error(`[Workbook Model] Error creating workbook:`, err);
        return null;
    }
}

/**
 * Renames an existing workbook.
 * @param {number} userId 
 * @param {number} id 
 * @param {string} name 
 * @returns {boolean} True if updated.
 */
function updateWorkbook(userId, id, name) {
    const db = getDb();
    try {
        const stmt = db.prepare('UPDATE workbooks SET name = ? WHERE id = ? AND user_id = ?');
        const result = stmt.run(name.trim(), id, userId);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Workbook Model] Error renaming workbook ${id}:`, err);
        return false;
    }
}

/**
 * Deletes a workbook. SQLite cascade rules delete linked tabs and expenses automatically.
 * @param {number} userId 
 * @param {number} id 
 * @returns {boolean} True if deleted.
 */
function deleteWorkbook(userId, id) {
    const db = getDb();
    try {
        const stmt = db.prepare('DELETE FROM workbooks WHERE id = ? AND user_id = ?');
        const result = stmt.run(id, userId);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Workbook Model] Error deleting workbook ${id}:`, err);
        return false;
    }
}

/**
 * Checks if a workbook belongs to a specific user.
 * @param {number} userId 
 * @param {number} workbookId 
 * @returns {boolean}
 */
function verifyWorkbookOwner(userId, workbookId) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT 1 FROM workbooks WHERE id = ? AND user_id = ?');
        const row = stmt.get(workbookId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

module.exports = {
    getWorkbooksByUserId,
    createWorkbook,
    updateWorkbook,
    deleteWorkbook,
    verifyWorkbookOwner
};
