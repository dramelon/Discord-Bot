const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'database.db');

let db = null;
let isInitialized = false;

function init() {
    if (isInitialized) return db;

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log(`[Database] Initializing SQLite database at: ${dbPath}`);
    db = new Database(dbPath);

    // Optimize settings: WAL mode and FULL synchronization for robustness and durability
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');

    // Create tables if they do not exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            username TEXT,
            displayname TEXT,
            level INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            totalXp INTEGER DEFAULT 0,
            totalMessages INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS minecraft_players (
            userId TEXT PRIMARY KEY,
            inventory TEXT,
            tools TEXT,
            equipped TEXT,
            furnaces TEXT,
            stats TEXT,
            unlocked_recipes TEXT,
            advancements TEXT
        );
    `);

    // Perform data migration from legacy JSON files
    migrateOldData(db);

    isInitialized = true;
    return db;
}

function migrateOldData(database) {
    const levelsPath = path.join(dataDir, 'levels.json');
    const playersPath = path.join(dataDir, 'minecraft', 'playerData', 'players.json');

    // 1. Migrate levels.json
    if (fs.existsSync(levelsPath)) {
        try {
            console.log('[Database Migration] Found levels.json, starting migration...');
            const content = fs.readFileSync(levelsPath, 'utf8');
            const data = JSON.parse(content || '{}');

            const checkStmt = database.prepare("SELECT COUNT(*) as count FROM users");
            const userCount = checkStmt.get().count;

            if (userCount === 0) {
                const insertStmt = database.prepare(`
                    INSERT INTO users (userId, username, displayname, level, xp, totalXp, totalMessages)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                
                const transaction = database.transaction((usersData) => {
                    for (const [userId, u] of Object.entries(usersData)) {
                        insertStmt.run(
                            userId,
                            u.username || null,
                            u.displayname || null,
                            u.level || 0,
                            u.xp || 0,
                            u.totalXp || 0,
                            u.totalMessages !== undefined ? u.totalMessages : (u.totalXp || 0)
                        );
                    }
                });

                transaction(data);
                console.log('[Database Migration] Successfully migrated levels.json to SQLite database.');
            } else {
                console.log('[Database Migration] Users table already has data, skipping levels migration.');
            }

            // Rename file to prevent re-migration
            fs.renameSync(levelsPath, levelsPath + '.bak');
            console.log('[Database Migration] Renamed levels.json to levels.json.bak');
        } catch (err) {
            console.error('[Database Migration] Error migrating levels.json:', err);
        }
    }

    // 2. Migrate players.json
    if (fs.existsSync(playersPath)) {
        try {
            console.log('[Database Migration] Found players.json, starting migration...');
            const content = fs.readFileSync(playersPath, 'utf8');
            const data = JSON.parse(content || '{}');

            const checkStmt = database.prepare("SELECT COUNT(*) as count FROM minecraft_players");
            const playerCount = checkStmt.get().count;

            if (playerCount === 0) {
                const insertStmt = database.prepare(`
                    INSERT INTO minecraft_players (userId, inventory, tools, equipped, furnaces, stats, unlocked_recipes, advancements)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const transaction = database.transaction((playersData) => {
                    for (const [userId, p] of Object.entries(playersData)) {
                        const inventory = p.inventory || {};
                        const tools = p.tools || [];
                        const equipped = p.equipped || { pickaxe: null };
                        const furnaces = p.furnaces || [];
                        const stats = p.stats || { trees_chopped: 0, blocks_mined: 0 };
                        const unlocked_recipes = p.unlocked_recipes || [];
                        const advancements = p.advancements || [];

                        insertStmt.run(
                            userId,
                            JSON.stringify(inventory),
                            JSON.stringify(tools),
                            JSON.stringify(equipped),
                            JSON.stringify(furnaces),
                            JSON.stringify(stats),
                            JSON.stringify(unlocked_recipes),
                            JSON.stringify(advancements)
                        );
                    }
                });

                transaction(data);
                console.log('[Database Migration] Successfully migrated players.json to SQLite database.');
            } else {
                console.log('[Database Migration] minecraft_players table already has data, skipping players migration.');
            }

            // Rename file to prevent re-migration
            fs.renameSync(playersPath, playersPath + '.bak');
            console.log('[Database Migration] Renamed players.json to players.json.bak');
        } catch (err) {
            console.error('[Database Migration] Error migrating players.json:', err);
        }
    }
}

// Ensure database is initialized before executing operations
function getDb() {
    if (!db) {
        init();
    }
    return db;
}

// ----------------------------------------------------
// USER LEVEL DATA (levels.json) API (using parameterized SQL query protection)
// ----------------------------------------------------

function getUserLevelData(userId) {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM users WHERE userId = ?");
    const row = stmt.get(userId);
    if (!row) {
        return { xp: 0, totalXp: 0, level: 0, totalMessages: 0 };
    }
    return {
        username: row.username,
        displayname: row.displayname,
        level: row.level,
        xp: row.xp,
        totalXp: row.totalXp,
        totalMessages: row.totalMessages
    };
}

function saveUserLevelData(userId, data) {
    const database = getDb();
    const stmt = database.prepare(`
        INSERT INTO users (userId, username, displayname, level, xp, totalXp, totalMessages)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
            username = excluded.username,
            displayname = excluded.displayname,
            level = excluded.level,
            xp = excluded.xp,
            totalXp = excluded.totalXp,
            totalMessages = excluded.totalMessages
    `);
    stmt.run(
        userId,
        data.username || null,
        data.displayname || null,
        data.level || 0,
        data.xp || 0,
        data.totalXp || 0,
        data.totalMessages || 0
    );
}

function getAllLevelData() {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM users");
    const rows = stmt.all();
    const data = {};
    for (const row of rows) {
        data[row.userId] = {
            username: row.username,
            displayname: row.displayname,
            level: row.level,
            xp: row.xp,
            totalXp: row.totalXp,
            totalMessages: row.totalMessages
        };
    }
    return data;
}

// ----------------------------------------------------
// MINECRAFT PLAYER DATA (players.json) API (using parameterized SQL query protection)
// ----------------------------------------------------

function getPlayerData(userId) {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM minecraft_players WHERE userId = ?");
    const row = stmt.get(userId);
    if (!row) {
        return {
            inventory: {
                oak_log: 0,
                stick: 0,
                apple: 0
            },
            tools: [],
            equipped: {
                pickaxe: null
            },
            furnaces: [],
            stats: {
                trees_chopped: 0,
                blocks_mined: 0
            },
            unlocked_recipes: [],
            advancements: []
        };
    }
    return {
        inventory: JSON.parse(row.inventory || '{}'),
        tools: JSON.parse(row.tools || '[]'),
        equipped: JSON.parse(row.equipped || '{"pickaxe":null}'),
        furnaces: JSON.parse(row.furnaces || '[]'),
        stats: JSON.parse(row.stats || '{"trees_chopped":0,"blocks_mined":0}'),
        unlocked_recipes: JSON.parse(row.unlocked_recipes || '[]'),
        advancements: JSON.parse(row.advancements || '[]')
    };
}

function savePlayerData(userId, data) {
    const database = getDb();
    const stmt = database.prepare(`
        INSERT INTO minecraft_players (userId, inventory, tools, equipped, furnaces, stats, unlocked_recipes, advancements)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
            inventory = excluded.inventory,
            tools = excluded.tools,
            equipped = excluded.equipped,
            furnaces = excluded.furnaces,
            stats = excluded.stats,
            unlocked_recipes = excluded.unlocked_recipes,
            advancements = excluded.advancements
    `);
    stmt.run(
        userId,
        JSON.stringify(data.inventory || {}),
        JSON.stringify(data.tools || []),
        JSON.stringify(data.equipped || {}),
        JSON.stringify(data.furnaces || []),
        JSON.stringify(data.stats || {}),
        JSON.stringify(data.unlocked_recipes || []),
        JSON.stringify(data.advancements || [])
    );
}

function getAllPlayerData() {
    const database = getDb();
    const rows = database.prepare("SELECT * FROM minecraft_players").all();
    const data = {};
    for (const row of rows) {
        data[row.userId] = {
            inventory: JSON.parse(row.inventory || '{}'),
            tools: JSON.parse(row.tools || '[]'),
            equipped: JSON.parse(row.equipped || '{"pickaxe":null}'),
            furnaces: JSON.parse(row.furnaces || '[]'),
            stats: JSON.parse(row.stats || '{"trees_chopped":0,"blocks_mined":0}'),
            unlocked_recipes: JSON.parse(row.unlocked_recipes || '[]'),
            advancements: JSON.parse(row.advancements || '[]')
        };
    }
    return data;
}

module.exports = {
    init,
    getUserLevelData,
    saveUserLevelData,
    getAllLevelData,
    getPlayerData,
    savePlayerData,
    getAllPlayerData
};
