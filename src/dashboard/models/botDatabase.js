const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'data', 'database.db');
let db = null;

function init() {
    if (!db) {
        console.log(`[Bot Database] Connecting to: ${dbPath}`);
        db = new Database(dbPath, { fileMustExist: false });
        // Set pragmas to prevent locking issues with the active bot
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        // Increase busy timeout so it waits if the bot is writing
        db.pragma('busy_timeout = 5000');
    }
    return db;
}

function getTables() {
    const database = init();
    const rows = database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
    return rows.map(r => r.name);
}

function getTableSchema(tableName) {
    const database = init();
    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    
    const info = database.prepare(`PRAGMA table_info(${tableName})`).all();
    const primaryKeys = info.filter(c => c.pk > 0).map(c => c.name);
    // If no explicit PK, fallback to rowid
    const pk = primaryKeys.length > 0 ? primaryKeys[0] : 'rowid'; 
    return { columns: info.map(c => c.name), pk };
}

function getTableData(tableName) {
    const database = init();
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    return database.prepare(`SELECT * FROM ${tableName}`).all();
}

function getRow(tableName, pkColumn, pkValue) {
    const database = init();
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    return database.prepare(`SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`).get(pkValue);
}

function updateRow(tableName, pkColumn, pkValue, newValues, expectedOldValues, force = false) {
    const database = init();
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');

    // Optimistic Concurrency Control
    if (!force && expectedOldValues) {
        const currentRow = getRow(tableName, pkColumn, pkValue);
        if (!currentRow) {
            throw { code: 'CONFLICT', message: 'Row no longer exists in the database', currentRow: null };
        }
        
        const conflicts = {};
        for (const [key, expectedVal] of Object.entries(expectedOldValues)) {
            // Ignore PK in conflict checking
            if (key === pkColumn) continue;
            
            let currentVal = currentRow[key];
            // Normalize for comparison (DB might return int, JS might have string from frontend)
            if (currentVal !== expectedVal && String(currentVal) !== String(expectedVal)) {
                conflicts[key] = { expected: expectedVal, actual: currentVal };
            }
        }

        if (Object.keys(conflicts).length > 0) {
            throw { code: 'CONFLICT', message: 'Data has been modified by the bot or another user', conflicts, currentRow };
        }
    }

    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(newValues)) {
        if (key !== pkColumn) {
            updates.push(`${key} = ?`);
            values.push(val);
        }
    }
    
    if (updates.length === 0) return true; // Nothing to update
    
    values.push(pkValue);
    const sql = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${pkColumn} = ?`;
    const stmt = database.prepare(sql);
    const result = stmt.run(...values);
    return result.changes > 0;
}

function deleteRow(tableName, pkColumn, pkValue) {
    const database = init();
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    const stmt = database.prepare(`DELETE FROM ${tableName} WHERE ${pkColumn} = ?`);
    const result = stmt.run(pkValue);
    return result.changes > 0;
}

function partialImportRow(tableName, pkColumn, pkValue, rowData) {
    const database = init();
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    
    const existing = getRow(tableName, pkColumn, pkValue);
    if (existing) {
        // Update
        const updates = [];
        const values = [];
        for (const [key, val] of Object.entries(rowData)) {
            if (key !== pkColumn && existing[key] !== undefined) {
                updates.push(`${key} = ?`);
                values.push(val);
            }
        }
        if (updates.length > 0) {
            values.push(pkValue);
            database.prepare(`UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${pkColumn} = ?`).run(...values);
        }
    } else {
        // Insert
        const cols = [];
        const vals = [];
        const placeholders = [];
        for (const [key, val] of Object.entries(rowData)) {
            cols.push(key);
            vals.push(val);
            placeholders.push('?');
        }
        if (cols.length > 0) {
            database.prepare(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`).run(...vals);
        }
    }
}

module.exports = {
    init,
    getTables,
    getTableSchema,
    getTableData,
    getRow,
    updateRow,
    deleteRow,
    partialImportRow
};
