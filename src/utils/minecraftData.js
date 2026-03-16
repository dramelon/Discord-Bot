const fs = require('fs');
const path = require('path');

const MINECRAFT_DIR = path.join(process.cwd(), 'data', 'minecraft');
const PLAYER_DATA_DIR = path.join(MINECRAFT_DIR, 'playerData');
const CORE_DATA_DIR = path.join(MINECRAFT_DIR, 'core');

const PLAYERS_FILE = path.join(PLAYER_DATA_DIR, 'players.json');
const CORE_FILE = path.join(CORE_DATA_DIR, 'minecraft.json');

// Ensure directories and files exist
function ensureExists() {
    [MINECRAFT_DIR, PLAYER_DATA_DIR, CORE_DATA_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    if (!fs.existsSync(PLAYERS_FILE)) {
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}), 'utf8');
    }

    if (!fs.existsSync(CORE_FILE)) {
        fs.writeFileSync(CORE_FILE, JSON.stringify({ last_updated: new Date().toISOString() }), 'utf8');
    }
}

function getPlayerData(userId) {
    ensureExists();
    let data = {};
    try {
        const content = fs.readFileSync(PLAYERS_FILE, 'utf8');
        data = JSON.parse(content);
    } catch (e) {
        console.error('Error reading players.json:', e);
    }
    
    if (!data[userId]) {
        data[userId] = {
            inventory: {
                oak_log: 0,
                stick: 0,
                apple: 0
            },
            stats: {
                trees_chopped: 0
            }
        };
    }
    return data;
}

function savePlayerData(data) {
    ensureExists();
    try {
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving players.json:', e);
    }
}

module.exports = {
    getPlayerData,
    savePlayerData
};
