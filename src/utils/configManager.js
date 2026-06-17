const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', '..', 'data', 'serverConfigs.json');

const DEFAULT_CREATE_VC_CHANNEL_ID = '1507240107864756244';
const DEFAULT_TEMP_VC_CATEGORY_ID = '1447192383178539070';
const DEFAULT_TEMP_VC_NAME_TEMPLATE = "{user}'s room";

let serverConfigs = {};

function loadConfigs() {
    if (fs.existsSync(dataPath)) {
        try {
            const data = fs.readFileSync(dataPath, 'utf8');
            if (data.trim()) {
                serverConfigs = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load serverConfigs:', error);
        }
    }
}

function saveConfigs() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(serverConfigs, null, 4), 'utf8');
    } catch (error) {
        console.error('Failed to save serverConfigs:', error);
    }
}

function getConfig(guildId) {
    const config = serverConfigs[guildId] || {};
    return {
        tempVCCreateChannelId: config.tempVCCreateChannelId || DEFAULT_CREATE_VC_CHANNEL_ID,
        tempVCCategoryId: config.tempVCCategoryId || DEFAULT_TEMP_VC_CATEGORY_ID,
        tempVCNameTemplate: config.tempVCNameTemplate || DEFAULT_TEMP_VC_NAME_TEMPLATE
    };
}

function updateConfig(guildId, key, value) {
    if (!serverConfigs[guildId]) {
        serverConfigs[guildId] = {};
    }
    serverConfigs[guildId][key] = value;
    saveConfigs();
}

function updateConfigs(guildId, updates) {
    if (!serverConfigs[guildId]) {
        serverConfigs[guildId] = {};
    }
    for (const [key, value] of Object.entries(updates)) {
        serverConfigs[guildId][key] = value;
    }
    saveConfigs();
}

// Load configurations on initialization
loadConfigs();

module.exports = {
    getConfig,
    updateConfig,
    updateConfigs,
    DEFAULT_CREATE_VC_CHANNEL_ID,
    DEFAULT_TEMP_VC_CATEGORY_ID,
    DEFAULT_TEMP_VC_NAME_TEMPLATE
};
