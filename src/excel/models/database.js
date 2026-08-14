const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data2');
const dbPath = path.join(dataDir, 'expenses.db');

let db = null;
let isInitialized = false;

function init() {
    if (isInitialized) return db;

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log(`[Excel Database] Initializing SQLite database at: ${dbPath}`);
    db = new Database(dbPath);

    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');

    // Detect if database requires a wipe/migration (e.g. columns table lacks 'reference_id')
    let schemaIsLegacy = false;
    try {
        const tableInfo = db.prepare("PRAGMA table_info(columns)").all();
        if (tableInfo.length > 0) {
            const hasRefId = tableInfo.some(col => col.name === 'reference_id');
            if (!hasRefId) {
                schemaIsLegacy = true;
            }
        }
    } catch (e) {
        // Table does not exist, safe to build from scratch
    }

    // Also check if legacy 'expenses' table still exists
    try {
        const expInfo = db.prepare("PRAGMA table_info(expenses)").all();
        if (expInfo.length > 0) {
            schemaIsLegacy = true;
        }
    } catch (e) {}

    if (schemaIsLegacy) {
        console.log('[Excel Database] Legacy table schema detected (columns missing reference_id or legacy expenses table exists). Wiping tables to apply lookups/autotag upgrade...');
        try {
            db.exec(`
                DROP TABLE IF EXISTS sessions;
                DROP TABLE IF EXISTS expenses;
                DROP TABLE IF EXISTS cells;
                DROP TABLE IF EXISTS rows;
                DROP TABLE IF EXISTS columns;
                DROP TABLE IF EXISTS reference_items;
                DROP TABLE IF EXISTS "references";
                DROP TABLE IF EXISTS tabs;
                DROP TABLE IF EXISTS workbooks;
                DROP TABLE IF EXISTS users;
            `);
            console.log('[Excel Database] Legacy tables wiped successfully.');
        } catch (err) {
            console.error('[Excel Database] Error wiping legacy tables:', err);
        }
    }

    // Create tables in new schema
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            salt TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workbooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tabs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workbook_id INTEGER,
            name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workbook_id) REFERENCES workbooks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "references" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reference_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference_id INTEGER,
            key TEXT,
            value TEXT,
            FOREIGN KEY (reference_id) REFERENCES "references"(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_id INTEGER,
            name TEXT,
            purpose TEXT, -- 'date', 'category', 'description', 'amount', 'number', 'text', 'autotag'
            position INTEGER,
            reference_id INTEGER, -- Points to references(id) for autotag autocomplete
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
            FOREIGN KEY (reference_id) REFERENCES "references"(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_id INTEGER,
            position INTEGER,
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cells (
            row_id INTEGER,
            column_id INTEGER,
            value TEXT,
            PRIMARY KEY (row_id, column_id),
            FOREIGN KEY (row_id) REFERENCES rows(id) ON DELETE CASCADE,
            FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS dashboards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS dashboard_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dashboard_id INTEGER,
            title TEXT,
            tab_id INTEGER,
            group_column_id TEXT,
            sum_column_id TEXT,
            position INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE,
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER,
            expires_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    isInitialized = true;
    return db;
}

function getDb() {
    if (!db) {
        init();
    }
    return db;
}

module.exports = {
    init,
    getDb
};
