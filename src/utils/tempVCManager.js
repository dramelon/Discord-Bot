const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', '..', 'data', 'tempChannels.json');

// Map to store temporary VCs in memory
// Key: channelId
// Value: { ownerId: string, locked: boolean, timer: NodeJS.Timeout | null }
const tempChannels = new Map();

function loadData() {
    if (fs.existsSync(dataPath)) {
        try {
            const fileData = fs.readFileSync(dataPath, 'utf8');
            const parsed = JSON.parse(fileData);
            
            // Reconstruct the Map
            for (const [channelId, data] of Object.entries(parsed)) {
                tempChannels.set(channelId, {
                    ownerId: data.ownerId,
                    locked: data.locked || false,
                    timer: null // Timers don't survive restart
                });
            }
        } catch (error) {
            console.error('Failed to load tempChannels data:', error);
        }
    }
}

function saveData() {
    const dataToSave = {};
    for (const [channelId, data] of tempChannels.entries()) {
        dataToSave[channelId] = {
            ownerId: data.ownerId,
            locked: data.locked
            // We intentionally don't save the timer object
        };
    }
    
    try {
        fs.writeFileSync(dataPath, JSON.stringify(dataToSave, null, 4), 'utf8');
    } catch (error) {
        console.error('Failed to save tempChannels data:', error);
    }
}

function addChannel(channelId, ownerId, locked = false) {
    tempChannels.set(channelId, {
        ownerId,
        locked,
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
        // Only save if locked state or owner changes, timer changes don't need saving
        if (updates.hasOwnProperty('locked') || updates.hasOwnProperty('ownerId')) {
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
