const { getDb } = require('./database');
const tabModel = require('./tabModel');

/**
 * Checks if a row belongs to a workbook owned by the user.
 * @param {number} userId 
 * @param {number} rowId 
 * @returns {boolean}
 */
function verifyRowOwner(userId, rowId) {
    const db = getDb();
    try {
        const stmt = db.prepare(`
            SELECT 1 FROM rows r
            JOIN tabs t ON r.tab_id = t.id
            JOIN workbooks w ON t.workbook_id = w.id
            WHERE r.id = ? AND w.user_id = ?
        `);
        const row = stmt.get(rowId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

/**
 * Checks if a column belongs to a workbook owned by the user.
 * @param {number} userId 
 * @param {number} columnId 
 * @returns {boolean}
 */
function verifyColumnOwner(userId, columnId) {
    const db = getDb();
    try {
        const stmt = db.prepare(`
            SELECT 1 FROM columns c
            JOIN tabs t ON c.tab_id = t.id
            JOIN workbooks w ON t.workbook_id = w.id
            WHERE c.id = ? AND w.user_id = ?
        `);
        const row = stmt.get(columnId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

/**
 * Gets all columns for a tab, sorted by position.
 * If empty, seeds default columns.
 * @param {number} userId 
 * @param {number} tabId 
 * @returns {Array<object>}
 */
function getColumnsByTabId(userId, tabId) {
    if (!tabModel.verifyTabOwner(userId, tabId)) return [];
    const db = getDb();

    try {
        const stmt = db.prepare('SELECT * FROM columns WHERE tab_id = ? ORDER BY position ASC');
        let cols = stmt.all(tabId);

        if (cols.length === 0) {
            // Seed default columns
            const defaults = [
                { name: 'Date', purpose: 'date', position: 0 },
                { name: 'Category', purpose: 'category', position: 1 },
                { name: 'Description', purpose: 'description', position: 2 },
                { name: 'Amount', purpose: 'amount', position: 3 }
            ];

            const seedTransaction = db.transaction((tId) => {
                const insertStmt = db.prepare('INSERT INTO columns (tab_id, name, purpose, position) VALUES (?, ?, ?, ?)');
                defaults.forEach(col => {
                    insertStmt.run(tId, col.name, col.purpose, col.position);
                });
            });

            seedTransaction(tabId);
            cols = stmt.all(tabId);
        }
        return cols;
    } catch (err) {
        console.error(`[Grid Model] Error getting columns for tab ${tabId}:`, err);
        return [];
    }
}

/**
 * Adds a new custom column.
 * @param {number} userId 
 * @param {number} tabId 
 * @param {string} name 
 * @returns {object|null} The created column details.
 */
function addColumn(userId, tabId, name) {
    if (!tabModel.verifyTabOwner(userId, tabId)) return null;
    const db = getDb();

    try {
        // Find max position
        const maxStmt = db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE tab_id = ?');
        const row = maxStmt.get(tabId);
        const position = row && row.maxPos !== null ? row.maxPos + 1 : 0;

        const insertStmt = db.prepare('INSERT INTO columns (tab_id, name, purpose, position) VALUES (?, ?, ?, ?)');
        const result = insertStmt.run(tabId, name.trim(), 'custom', position);

        return {
            id: result.lastInsertRowid,
            tab_id: tabId,
            name: name.trim(),
            purpose: 'custom',
            position
        };
    } catch (err) {
        console.error('[Grid Model] Error adding column:', err);
        return null;
    }
}

/**
 * Renames a column.
 * @param {number} userId 
 * @param {number} id Column ID
 * @param {string} name New name
 * @returns {boolean} True if updated.
 */
function updateColumn(userId, id, name) {
    if (!verifyColumnOwner(userId, id)) return false;
    const db = getDb();

    try {
        const stmt = db.prepare('UPDATE columns SET name = ? WHERE id = ?');
        const result = stmt.run(name.trim(), id);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Grid Model] Error updating column ${id}:`, err);
        return false;
    }
}

/**
 * Swaps positions of two columns on the same tab.
 * @param {number} userId 
 * @param {number} id1 Column 1 ID
 * @param {number} id2 Column 2 ID
 * @returns {boolean} True if swapped.
 */
function swapColumns(userId, id1, id2) {
    if (!verifyColumnOwner(userId, id1) || !verifyColumnOwner(userId, id2)) return false;
    const db = getDb();

    try {
        const getCol = db.prepare('SELECT tab_id, position FROM columns WHERE id = ?');
        const col1 = getCol.get(id1);
        const col2 = getCol.get(id2);

        if (!col1 || !col2 || col1.tab_id !== col2.tab_id) {
            return false;
        }

        const swapTransaction = db.transaction((c1, c2) => {
            const updateStmt = db.prepare('UPDATE columns SET position = ? WHERE id = ?');
            updateStmt.run(c2.position, c1.id);
            updateStmt.run(c1.position, c2.id);
        });

        swapTransaction({ id: id1, position: col1.position }, { id: id2, position: col2.position });
        return true;
    } catch (err) {
        console.error('[Grid Model] Error swapping columns:', err);
        return false;
    }
}

/**
 * Deletes a column.
 * @param {number} userId 
 * @param {number} id Column ID
 * @returns {boolean} True if deleted.
 */
function deleteColumn(userId, id) {
    if (!verifyColumnOwner(userId, id)) return false;
    const db = getDb();

    try {
        const stmt = db.prepare('DELETE FROM columns WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Grid Model] Error deleting column ${id}:`, err);
        return false;
    }
}

/**
 * Gets the complete grid data (columns list and rows list).
 * @param {number} userId 
 * @param {number} tabId 
 * @returns {object|null}
 */
function getGridData(userId, tabId) {
    if (!tabModel.verifyTabOwner(userId, tabId)) return null;
    const db = getDb();

    try {
        const columns = getColumnsByTabId(userId, tabId);
        
        // Fetch rows
        const rowsStmt = db.prepare('SELECT id, position FROM rows WHERE tab_id = ? ORDER BY position DESC, id DESC');
        const rawRows = rowsStmt.all(tabId);

        // Fetch cells mapped by row_id and column_id
        const cellsStmt = db.prepare(`
            SELECT c.row_id, c.column_id, c.value 
            FROM cells c 
            JOIN rows r ON c.row_id = r.id 
            WHERE r.tab_id = ?
        `);
        const rawCells = cellsStmt.all(tabId);

        // Map cells to rows
        const cellsByRow = {};
        rawCells.forEach(cell => {
            if (!cellsByRow[cell.row_id]) {
                cellsByRow[cell.row_id] = {};
            }
            cellsByRow[cell.row_id][cell.column_id] = cell.value;
        });

        const rows = rawRows.map(row => ({
            id: row.id,
            position: row.position,
            cells: cellsByRow[row.id] || {}
        }));

        return {
            columns,
            rows
        };
    } catch (err) {
        console.error(`[Grid Model] Error fetching grid data for tab ${tabId}:`, err);
        return null;
    }
}

/**
 * Adds an empty row.
 * @param {number} userId 
 * @param {number} tabId 
 * @returns {number|null} The row ID.
 */
function addRow(userId, tabId) {
    if (!tabModel.verifyTabOwner(userId, tabId)) return null;
    const db = getDb();

    try {
        // Find max position
        const maxStmt = db.prepare('SELECT MAX(position) as maxPos FROM rows WHERE tab_id = ?');
        const row = maxStmt.get(tabId);
        const position = row && row.maxPos !== null ? row.maxPos + 1 : 0;

        const insertStmt = db.prepare('INSERT INTO rows (tab_id, position) VALUES (?, ?)');
        const result = insertStmt.run(tabId, position);
        return result.lastInsertRowid;
    } catch (err) {
        console.error('[Grid Model] Error adding row:', err);
        return null;
    }
}

/**
 * Deletes a row.
 * @param {number} userId 
 * @param {number} rowId 
 * @returns {boolean} True if deleted.
 */
function deleteRow(userId, rowId) {
    if (!verifyRowOwner(userId, rowId)) return false;
    const db = getDb();

    try {
        const stmt = db.prepare('DELETE FROM rows WHERE id = ?');
        const result = stmt.run(rowId);
        return result.changes > 0;
    } catch (err) {
        console.error(`[Grid Model] Error deleting row ${rowId}:`, err);
        return false;
    }
}

/**
 * Updates a cell value (UPSERT).
 * @param {number} userId 
 * @param {number} rowId 
 * @param {number} columnId 
 * @param {string} value 
 * @returns {boolean} True if updated.
 */
function updateCell(userId, rowId, columnId, value) {
    if (!verifyRowOwner(userId, rowId) || !verifyColumnOwner(userId, columnId)) return false;
    const db = getDb();

    try {
        const stmt = db.prepare(`
            INSERT INTO cells (row_id, column_id, value) 
            VALUES (?, ?, ?)
            ON CONFLICT(row_id, column_id) 
            DO UPDATE SET value = excluded.value
        `);
        stmt.run(rowId, columnId, value !== null && value !== undefined ? String(value) : '');
        return true;
    } catch (err) {
        console.error(`[Grid Model] Error updating cell (Row: ${rowId}, Col: ${columnId}):`, err);
        return false;
    }
}

/**
 * Saves/commits a bulk list of columns for a tab, deleting missing ones,
 * updating name/positions of existing ones, and inserting new ones.
 * @param {number} userId 
 * @param {number} tabId 
 * @param {Array<object>} clientColumns 
 * @returns {boolean} True if successful.
 */
function saveColumns(userId, tabId, clientColumns) {
    if (!tabModel.verifyTabOwner(userId, tabId)) return false;
    const db = getDb();

    try {
        const saveTransaction = db.transaction((tId, cols) => {
            // 1. Get current columns from DB
            const getStmt = db.prepare('SELECT id, purpose FROM columns WHERE tab_id = ?');
            const dbCols = getStmt.all(tId);

            // 2. Identify and delete columns not in client list
            const clientIds = cols.map(c => c.id).filter(id => !String(id).startsWith('temp_')).map(Number);
            const deleteStmt = db.prepare('DELETE FROM columns WHERE id = ?');
            dbCols.forEach(dbCol => {
                if (!clientIds.includes(dbCol.id)) {
                    deleteStmt.run(dbCol.id);
                }
            });

            // 3. Insert new and update existing
            const insertStmt = db.prepare('INSERT INTO columns (tab_id, name, purpose, position, reference_id) VALUES (?, ?, ?, ?, ?)');
            const updateStmt = db.prepare('UPDATE columns SET name = ?, purpose = ?, position = ?, reference_id = ? WHERE id = ?');

            cols.forEach((col, index) => {
                const refId = col.reference_id && !isNaN(Number(col.reference_id)) ? Number(col.reference_id) : null;
                const purposeVal = col.purpose || 'text';
                
                if (String(col.id).startsWith('temp_')) {
                    insertStmt.run(tId, col.name.trim(), purposeVal, index, refId);
                } else {
                    updateStmt.run(col.name.trim(), purposeVal, index, refId, Number(col.id));
                }
            });
        });

        saveTransaction(tabId, clientColumns);
        return true;
    } catch (err) {
        console.error(`[Grid Model] Error in bulk saving columns for tab ${tabId}:`, err);
        return false;
    }
}

module.exports = {
    getColumnsByTabId,
    addColumn,
    updateColumn,
    swapColumns,
    deleteColumn,
    getGridData,
    addRow,
    deleteRow,
    updateCell,
    saveColumns
};
