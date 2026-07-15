const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', '..', 'data', 'tempChannels.json');

// Map to store temporary VCs in memory
// Key: channelId
// Value: { guildId: string, ownerId: string, name: string, locked: boolean, createdAt: number, allowedUsers: Array, userPermissions: Object, timer: NodeJS.Timeout | null }
const tempChannels = new Map();

function loadData() {
    if (fs.existsSync(dataPath)) {
        try {
            const fileData = fs.readFileSync(dataPath, 'utf8');
            if (!fileData.trim()) return;
            const parsed = JSON.parse(fileData);
            
            // Reconstruct the Map
            const entries = Object.entries(parsed);
            if (entries.length > 0) {
                const [firstKey, firstVal] = entries[0];
                if (firstVal && typeof firstVal === 'object' && firstVal.hasOwnProperty('ownerId')) {
                    // Legacy Flat format
                    for (const [channelId, data] of entries) {
                        tempChannels.set(channelId, {
                            guildId: '1447192381479976993', // Fallback to Hometown server ID
                            ownerId: data.ownerId,
                            name: data.name || '',
                            locked: data.locked || false,
                            createdAt: data.createdAt || Date.now(),
                            allowedUsers: data.allowedUsers || [],
                            userPermissions: data.userPermissions || {},
                            timer: null
                        });
                    }
                } else {
                    // Nested Guild format
                    for (const [guildId, channels] of entries) {
                        if (channels && typeof channels === 'object') {
                            for (const [channelId, data] of Object.entries(channels)) {
                                tempChannels.set(channelId, {
                                    guildId: guildId,
                                    ownerId: data.ownerId,
                                    name: data.name || '',
                                    locked: data.locked || false,
                                    createdAt: data.createdAt || Date.now(),
                                    allowedUsers: data.allowedUsers || [],
                                    userPermissions: data.userPermissions || {},
                                    timer: null
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load tempChannels data:', error);
        }
    }
}

function saveData() {
    const dataToSave = {};
    for (const [channelId, data] of tempChannels.entries()) {
        const guildId = data.guildId;
        if (!guildId) continue;
        if (!dataToSave[guildId]) {
            dataToSave[guildId] = {};
        }
        dataToSave[guildId][channelId] = {
            ownerId: data.ownerId,
            name: data.name || '',
            locked: data.locked || false,
            createdAt: data.createdAt || Date.now(),
            allowedUsers: data.allowedUsers || [],
            userPermissions: data.userPermissions || {}
        };
    }
    
    try {
        fs.writeFileSync(dataPath, JSON.stringify(dataToSave, null, 4), 'utf8');
    } catch (error) {
        console.error('Failed to save tempChannels data:', error);
    }
}

function addChannel(channelId, guildId, ownerId, name = '', locked = false, allowedUsers = [], userPermissions = {}) {
    tempChannels.set(channelId, {
        guildId,
        ownerId,
        name,
        locked,
        createdAt: Date.now(),
        allowedUsers,
        userPermissions,
        timer: null
    });
    saveData();
}

function removeChannel(channelId) {
    const vcData = tempChannels.get(channelId);
    if (vcData && vcData.timer) {
        clearTimeout(vcData.timer);
    }
    tempChannels.delete(channelId);
    saveData();
}

function getChannel(channelId) {
    return tempChannels.get(channelId);
}

function updateChannel(channelId, updates) {
    if (tempChannels.has(channelId)) {
        const current = tempChannels.get(channelId);
        tempChannels.set(channelId, { ...current, ...updates });
        // Only save if locked, ownerId, name, allowedUsers, or userPermissions changes
        const saveKeys = ['locked', 'ownerId', 'name', 'allowedUsers', 'userPermissions'];
        const shouldSave = Object.keys(updates).some(k => saveKeys.includes(k));
        if (shouldSave) {
            saveData();
        }
    }
}

// Load data immediately upon requiring the module
loadData();

module.exports = {
    tempChannels,
    addChannel,
    removeChannel,
    getChannel,
    updateChannel,
    saveData
};
