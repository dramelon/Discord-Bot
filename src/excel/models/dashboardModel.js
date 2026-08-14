const { getDb } = require('./database');

function parseIds(val) {
    if (val === null || val === undefined || val === '') return [];
    if (typeof val === 'number') return [val];
    return String(val).split(',').map(s => s.trim()).filter(Boolean).map(s => {
        return isNaN(Number(s)) ? s : Number(s);
    });
}

/**
 * Verifies if a dashboard belongs to the user.
 * @param {number} userId 
 * @param {number} dashboardId 
 * @returns {boolean}
 */
function verifyDashboardOwner(userId, dashboardId) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT 1 FROM dashboards WHERE id = ? AND user_id = ?');
        const row = stmt.get(dashboardId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

/**
 * Verifies if a dashboard card belongs to the user.
 * @param {number} userId 
 * @param {number} cardId 
 * @returns {boolean}
 */
function verifyCardOwner(userId, cardId) {
    const db = getDb();
    try {
        const stmt = db.prepare(`
            SELECT 1 FROM dashboard_cards dc
            JOIN dashboards d ON dc.dashboard_id = d.id
            WHERE dc.id = ? AND d.user_id = ?
        `);
        const row = stmt.get(cardId, userId);
        return !!row;
    } catch (e) {
        return false;
    }
}

/**
 * Gets all dashboards for a user.
 * @param {number} userId 
 * @returns {Array<object>}
 */
function getDashboards(userId) {
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT * FROM dashboards WHERE user_id = ? ORDER BY name ASC');
        let dashboards = stmt.all(userId);
        if (dashboards.length === 0) {
            console.log(`[Dashboard Model] User ${userId} has no dashboards. Seeding "Main Dashboard"...`);
            const seeded = createDashboard(userId, 'Main Dashboard');
            if (seeded) {
                dashboards = stmt.all(userId);
            }
        }
        return dashboards;
    } catch (err) {
        console.error('[Dashboard Model] Error getting dashboards:', err);
        return [];
    }
}

/**
 * Creates a new dashboard.
 * @param {number} userId 
 * @param {string} name 
 * @returns {object|null}
 */
function createDashboard(userId, name) {
    const db = getDb();
    try {
        const stmt = db.prepare('INSERT INTO dashboards (user_id, name) VALUES (?, ?)');
        const result = stmt.run(userId, name.trim());
        return {
            id: result.lastInsertRowid,
            user_id: userId,
            name: name.trim()
        };
    } catch (err) {
        console.error('[Dashboard Model] Error creating dashboard:', err);
        return null;
    }
}

/**
 * Renames a dashboard.
 * @param {number} userId 
 * @param {number} dashboardId 
 * @param {string} name 
 * @returns {boolean}
 */
function updateDashboard(userId, dashboardId, name) {
    if (!verifyDashboardOwner(userId, dashboardId)) return false;
    const db = getDb();
    try {
        const stmt = db.prepare('UPDATE dashboards SET name = ? WHERE id = ?');
        const result = stmt.run(name.trim(), dashboardId);
        return result.changes > 0;
    } catch (err) {
        console.error('[Dashboard Model] Error updating dashboard:', err);
        return false;
    }
}

/**
 * Deletes a dashboard and all its cards.
 * @param {number} userId 
 * @param {number} dashboardId 
 * @returns {boolean}
 */
function deleteDashboard(userId, dashboardId) {
    if (!verifyDashboardOwner(userId, dashboardId)) return false;
    const db = getDb();
    try {
        const stmt = db.prepare('DELETE FROM dashboards WHERE id = ?');
        const result = stmt.run(dashboardId);
        return result.changes > 0;
    } catch (err) {
        console.error('[Dashboard Model] Error deleting dashboard:', err);
        return false;
    }
}

/**
 * Gets all cards configuration for a dashboard.
 * @param {number} userId 
 * @param {number} dashboardId 
 * @returns {Array<object>}
 */
function getDashboardCards(userId, dashboardId) {
    if (!verifyDashboardOwner(userId, dashboardId)) return [];
    const db = getDb();
    try {
        const stmt = db.prepare(`
            SELECT dc.*, 
                   t.name as tab_name, 
                   w.name as workbook_name,
                   gc.name as group_column_name,
                   sc.name as sum_column_name
            FROM dashboard_cards dc
            LEFT JOIN tabs t ON dc.tab_id = t.id
            LEFT JOIN workbooks w ON t.workbook_id = w.id
            LEFT JOIN columns gc ON dc.group_column_id = gc.id
            LEFT JOIN columns sc ON dc.sum_column_id = sc.id
            WHERE dc.dashboard_id = ?
            ORDER BY dc.position ASC, dc.created_at ASC
        `);
        return stmt.all(dashboardId);
    } catch (err) {
        console.error('[Dashboard Model] Error getting cards:', err);
        return [];
    }
}

/**
 * Creates a new dashboard card.
 */
function createDashboardCard(userId, dashboardId, title, tabId, groupColId, sumColId) {
    if (!verifyDashboardOwner(userId, dashboardId)) return null;
    const db = getDb();
    try {
        const maxStmt = db.prepare('SELECT MAX(position) as maxPos FROM dashboard_cards WHERE dashboard_id = ?');
        const row = maxStmt.get(dashboardId);
        const position = row && row.maxPos !== null ? row.maxPos + 1 : 0;

        const stmt = db.prepare(`
            INSERT INTO dashboard_cards (dashboard_id, title, tab_id, group_column_id, sum_column_id, position)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(dashboardId, title.trim(), tabId, groupColId, sumColId, position);
        return {
            id: result.lastInsertRowid,
            dashboard_id: dashboardId,
            title: title.trim(),
            tab_id: tabId,
            group_column_id: groupColId,
            sum_column_id: sumColId,
            position
        };
    } catch (err) {
        console.error('[Dashboard Model] Error creating card:', err);
        return null;
    }
}

/**
 * Updates dashboard card configurations.
 */
function updateDashboardCard(userId, cardId, title, tabId, groupColId, sumColId) {
    if (!verifyCardOwner(userId, cardId)) return false;
    const db = getDb();
    try {
        const stmt = db.prepare(`
            UPDATE dashboard_cards 
            SET title = ?, tab_id = ?, group_column_id = ?, sum_column_id = ?
            WHERE id = ?
        `);
        const result = stmt.run(title.trim(), tabId, groupColId, sumColId, cardId);
        return result.changes > 0;
    } catch (err) {
        console.error('[Dashboard Model] Error updating card:', err);
        return false;
    }
}

/**
 * Deletes a dashboard card.
 */
function deleteDashboardCard(userId, cardId) {
    if (!verifyCardOwner(userId, cardId)) return false;
    const db = getDb();
    try {
        const stmt = db.prepare('DELETE FROM dashboard_cards WHERE id = ?');
        const result = stmt.run(cardId);
        return result.changes > 0;
    } catch (err) {
        console.error('[Dashboard Model] Error deleting card:', err);
        return false;
    }
}

/**
 * Computes summarized group sums/counts for a dashboard card.
 * Supports multiple group-by columns and multiple sum/count metric columns.
 * @param {number} userId 
 * @param {number} cardId 
 * @returns {object} { dataset, group_columns, sum_columns }
 */
function getCardSummarizedData(userId, cardId) {
    if (!verifyCardOwner(userId, cardId)) return { dataset: [], group_columns: [], sum_columns: [] };
    const db = getDb();
    try {
        const cardStmt = db.prepare('SELECT tab_id, group_column_id, sum_column_id FROM dashboard_cards WHERE id = ?');
        const card = cardStmt.get(cardId);
        if (!card || !card.tab_id || !card.group_column_id) {
            return { dataset: [], group_columns: [], sum_columns: [] };
        }

        const groupColIds = parseIds(card.group_column_id);
        const sumColIds = parseIds(card.sum_column_id);

        if (groupColIds.length === 0) {
            return { dataset: [], group_columns: [], sum_columns: [] };
        }

        const colsStmt = db.prepare('SELECT id, name, purpose FROM columns WHERE tab_id = ? ORDER BY position ASC');
        const allColumns = colsStmt.all(card.tab_id);

        const groupColumns = groupColIds.map(id => allColumns.find(c => c.id === id)).filter(Boolean);
        const sumColumns = sumColIds.map(id => {
            if (id === 'count') {
                return { id: 'count', name: 'Record Count', purpose: 'number' };
            }
            return allColumns.find(c => c.id === id);
        }).filter(Boolean);

        const rowsStmt = db.prepare('SELECT id FROM rows WHERE tab_id = ? ORDER BY position ASC');
        const rows = rowsStmt.all(card.tab_id);
        const rowIds = rows.map(r => r.id);

        if (rowIds.length === 0) {
            return { dataset: [], group_columns: groupColumns, sum_columns: sumColumns };
        }

        const cells = [];
        const chunkSize = 900;
        for (let i = 0; i < rowIds.length; i += chunkSize) {
            const chunk = rowIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const cellsStmt = db.prepare(`SELECT row_id, column_id, value FROM cells WHERE row_id IN (${placeholders})`);
            const chunkCells = cellsStmt.all(...chunk);
            cells.push(...chunkCells);
        }

        const rowCells = {};
        rowIds.forEach(id => {
            rowCells[id] = {};
        });
        cells.forEach(c => {
            if (rowCells[c.row_id]) {
                rowCells[c.row_id][c.column_id] = c.value || '';
            }
        });

        const groups = {};
        rowIds.forEach(rowId => {
            const keys = groupColumns.map(col => {
                const val = rowCells[rowId][col.id];
                return val !== undefined && val !== '' ? String(val) : '(Empty)';
            });
            const keyString = keys.join(' | ');

            if (!groups[keyString]) {
                groups[keyString] = {
                    group_key: keyString,
                    group_values: keys,
                    metrics: {}
                };
                sumColumns.forEach(sc => {
                    groups[keyString].metrics[sc.id] = 0;
                });
            }

            sumColumns.forEach(sc => {
                if (sc.id === 'count') {
                    groups[keyString].metrics['count'] += 1;
                } else {
                    const val = parseFloat(rowCells[rowId][sc.id] || 0);
                    groups[keyString].metrics[sc.id] += isNaN(val) ? 0 : val;
                }
            });
        });

        const dataset = Object.values(groups);
        
        return {
            dataset,
            group_columns: groupColumns,
            sum_columns: sumColumns
        };

    } catch (err) {
        console.error('[Dashboard Model] Aggregation error:', err);
        return { dataset: [], group_columns: [], sum_columns: [] };
    }
}

/**
 * Duplicates a dashboard card.
 */
function duplicateDashboardCard(userId, cardId) {
    if (!verifyCardOwner(userId, cardId)) return null;
    const db = getDb();
    try {
        const stmt = db.prepare('SELECT * FROM dashboard_cards WHERE id = ?');
        const card = stmt.get(cardId);
        if (!card) return null;

        const newTitle = card.title + ' - copy';

        const maxStmt = db.prepare('SELECT MAX(position) as maxPos FROM dashboard_cards WHERE dashboard_id = ?');
        const row = maxStmt.get(card.dashboard_id);
        const position = row && row.maxPos !== null ? row.maxPos + 1 : 0;

        const insertStmt = db.prepare(`
            INSERT INTO dashboard_cards (dashboard_id, title, tab_id, group_column_id, sum_column_id, position)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = insertStmt.run(card.dashboard_id, newTitle, card.tab_id, card.group_column_id, card.sum_column_id, position);
        
        return {
            id: result.lastInsertRowid,
            dashboard_id: card.dashboard_id,
            title: newTitle,
            tab_id: card.tab_id,
            group_column_id: card.group_column_id,
            sum_column_id: card.sum_column_id,
            position
        };
    } catch (err) {
        console.error('[Dashboard Model] Error duplicating card:', err);
        return null;
    }
}

/**
 * Updates positions of multiple dashboard cards.
 */
function updateCardPositions(userId, cardIds) {
    const db = getDb();
    try {
        const verifyStmt = db.prepare(`
            SELECT dc.id FROM dashboard_cards dc
            JOIN dashboards d ON dc.dashboard_id = d.id
            WHERE dc.id = ? AND d.user_id = ?
        `);
        const updateStmt = db.prepare('UPDATE dashboard_cards SET position = ? WHERE id = ?');
        
        const transaction = db.transaction((ids) => {
            for (let i = 0; i < ids.length; i++) {
                const cardId = ids[i];
                const exists = verifyStmt.get(cardId, userId);
                if (exists) {
                    updateStmt.run(i, cardId);
                }
            }
        });
        transaction(cardIds);
        return true;
    } catch (err) {
        console.error('[Dashboard Model] Error updating positions:', err);
        return false;
    }
}

module.exports = {
    getDashboards,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    getDashboardCards,
    createDashboardCard,
    updateDashboardCard,
    deleteDashboardCard,
    getCardSummarizedData,
    duplicateDashboardCard,
    updateCardPositions
};
