const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuration
const TRACKING_CHANNEL_ID = '1506242621415231519';
const WEBHOOK_USER_ID = '1508476744955461734';
const SCOREBOARD_CHANNEL_ID = '1509573689061150770';
const PRESENCE_MESSAGE_ID = '1510891112531890286';

// File Paths (Isolate test data when running test suite)
const DATA_DIR = process.env.NODE_ENV === 'test'
    ? path.join(process.cwd(), 'data', 'minecraft_test')
    : path.join(process.cwd(), 'data', 'minecraft');
const PRESENCE_FILE = path.join(DATA_DIR, 'presence_tracker.json');
const MAP_FILE = path.join(DATA_DIR, 'username_map.json');

// Regexes
const JOIN_REGEX = /(?<username>\S+)\s+has joined the server/i;
const LEAVE_REGEX = /(?<username>\S+)\s+has left the server/i;
const SERVER_START_REGEX = /:wasabi_berry:\s*Server\s+has\s+started!\s*Enjoy~/i;

/**
 * Safely load a JSON file, returning a default value if it does not exist or fails to parse.
 */
function loadJSON(filePath, defaultValue = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`[PresenceTracker] Failed to read/parse ${path.basename(filePath)}:`, error);
        return defaultValue;
    }
}

/**
 * Safely save a JSON file, creating parent directories if necessary.
 */
function saveJSON(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`[PresenceTracker] Failed to save ${path.basename(filePath)}:`, error);
    }
}

/**
 * Update the server presence message with online players and recent join/leave logs.
 */
async function updatePresenceTracker(client) {
    try {
        const presenceData = loadJSON(PRESENCE_FILE, { players: {}, presenceLogs: [], lastUpdated: 0 });
        const mapData = loadJSON(MAP_FILE, {});

        // Gather online players
        const onlinePlayers = Object.entries(presenceData.players)
            .filter(([username, p]) => p.online === true)
            .map(([username]) => username);

        let onlineText = '';
        if (onlinePlayers.length === 0) {
            onlineText = '*No players online right now.*';
        } else {
            onlineText = onlinePlayers.map(username => {
                const mappedKey = Object.keys(mapData).find(k => k.toLowerCase() === username.toLowerCase());
                const discordId = mappedKey ? mapData[mappedKey] : null;
                const displayName = discordId ? `<@${discordId}>` : `\`${username}\``;
                return `🟢 ${displayName}`;
            }).join('\n');
        }

        // Build presence logs (last 20, newest first)
        let logsText = '';
        const logs = (presenceData.presenceLogs || []).slice(-20).reverse();
        if (logs.length === 0) {
            logsText = '*No join/leave activity logged yet.*';
        } else {
            logsText = logs.map(log => {
                const mappedKey = Object.keys(mapData).find(k => k.toLowerCase() === log.username.toLowerCase());
                const discordId = mappedKey ? mapData[mappedKey] : null;
                const displayName = discordId ? `<@${discordId}>` : `\`${log.username}\``;
                const timeSecs = Math.floor(log.timestamp / 1000);
                const icon = log.type === 'join' ? '🟢' : '🔴';
                const actionText = log.type === 'join' ? 'joined' : 'left';
                return `${icon} <t:${timeSecs}:f> - ${displayName} ${actionText} the server`;
            }).join('\n');
        }

        const embed = new EmbedBuilder()
            .setTitle('🔌 MINECRAFT SERVER PRESENCE')
            .setDescription('Current server online list and recent join/leave logs.')
            .setColor(0x2ECC71) // Green
            .addFields(
                { name: '👥 Online Players', value: onlineText, inline: false },
                { name: '📋 Recent Activity Log', value: logsText, inline: false }
            )
            .setTimestamp();

        const channel = await client.channels.fetch(SCOREBOARD_CHANNEL_ID);
        if (!channel) return;

        const message = await channel.messages.fetch(PRESENCE_MESSAGE_ID);
        if (!message) return;

        await message.edit({ embeds: [embed] });
        console.log(`[PresenceTracker] Presence scoreboard message edited successfully.`);
    } catch (error) {
        console.error(`[PresenceTracker] Failed to update presence message:`, error);
    }
}

// Rate-limiting state variables (Presence)
let presenceCooldownActive = false;
let presencePending = false;
let presenceCooldownTimer = null;

/**
 * Request an update to the presence tracker.
 */
async function requestPresenceUpdate(client) {
    if (!presenceCooldownActive) {
        presenceCooldownActive = true;
        presencePending = false;
        await updatePresenceTracker(client);
        presenceCooldownTimer = setTimeout(async () => {
            presenceCooldownActive = false;
            presenceCooldownTimer = null;
            if (presencePending) {
                await requestPresenceUpdate(client);
            }
        }, 15000);
    } else {
        presencePending = true;
    }
}

/**
 * Handle new messages to track Minecraft server presence (joins, leaves, restarts).
 */
async function handlePresenceMessage(message) {
    // 1. Validate Channel
    if (message.channelId !== TRACKING_CHANNEL_ID) return;

    // 2. Validate Author
    if (message.author.id !== WEBHOOK_USER_ID) return;

    const textsToProcess = [];
    if (message.content) {
        textsToProcess.push(message.content);
    }
    if (message.embeds && message.embeds.length > 0) {
        message.embeds.forEach(embed => {
            const text = embed.description || embed.title || '';
            if (text) textsToProcess.push(text);
        });
    }

    if (textsToProcess.length === 0) return;

    let presenceChanged = false;

    // Load current presence database
    const presenceData = loadJSON(PRESENCE_FILE, { players: {}, presenceLogs: [], lastUpdated: 0 });

    // Utility to ensure player is initialized in database
    const ensurePlayerState = (username) => {
        let playerKey = Object.keys(presenceData.players).find(
            k => k.toLowerCase() === username.toLowerCase()
        );
        if (!playerKey) {
            playerKey = username;
            presenceData.players[playerKey] = {
                online: false,
                lastUpdated: 0
            };
        }
        if (presenceData.players[playerKey].online === undefined) presenceData.players[playerKey].online = false;
        return playerKey;
    };

    for (const text of textsToProcess) {
        // 0. Check if it's a server start message
        if (SERVER_START_REGEX.test(text)) {
            for (const playerKey in presenceData.players) {
                presenceData.players[playerKey].online = false;
            }
            presenceData.lastUpdated = Date.now();
            presenceChanged = true;
            console.log(`[PresenceTracker] Server started message detected. Reset all player online states to offline.`);
            continue;
        }

        // A. Check if it's a join message
        const joinMatch = text.match(JOIN_REGEX);
        if (joinMatch) {
            const { username } = joinMatch.groups;
            if (username) {
                const cleanUsername = username.trim();
                const playerKey = ensurePlayerState(cleanUsername);
                
                presenceData.players[playerKey].online = true;
                presenceData.players[playerKey].lastUpdated = Date.now();
                
                if (!presenceData.presenceLogs) {
                    presenceData.presenceLogs = [];
                }
                presenceData.presenceLogs.push({
                    username: cleanUsername,
                    type: 'join',
                    timestamp: Date.now()
                });
                presenceData.lastUpdated = Date.now();
                presenceChanged = true;
                console.log(`[PresenceTracker] Player joined: ${cleanUsername}`);
            }
            continue;
        }

        // B. Check if it's a leave message
        const leaveMatch = text.match(LEAVE_REGEX);
        if (leaveMatch) {
            const { username } = leaveMatch.groups;
            if (username) {
                const cleanUsername = username.trim();
                const playerKey = ensurePlayerState(cleanUsername);
                
                presenceData.players[playerKey].online = false;
                presenceData.players[playerKey].lastUpdated = Date.now();
                
                if (!presenceData.presenceLogs) {
                    presenceData.presenceLogs = [];
                }
                presenceData.presenceLogs.push({
                    username: cleanUsername,
                    type: 'leave',
                    timestamp: Date.now()
                });
                presenceData.lastUpdated = Date.now();
                presenceChanged = true;
                console.log(`[PresenceTracker] Player left: ${cleanUsername}`);
            }
            continue;
        }
    }

    if (presenceChanged) {
        saveJSON(PRESENCE_FILE, presenceData);
        await requestPresenceUpdate(message.client);
    }
}

// Clean up helper for testing rate limits
function getRateLimitState() {
    return {
        presenceCooldownActive,
        presencePending,
        presenceCooldownTimer
    };
}

// Clean up helper for resetting rate limit timers in tests
function resetRateLimitState() {
    if (presenceCooldownTimer) {
        clearTimeout(presenceCooldownTimer);
        presenceCooldownTimer = null;
    }
    presenceCooldownActive = false;
    presencePending = false;
}

module.exports = {
    TRACKING_CHANNEL_ID,
    WEBHOOK_USER_ID,
    SCOREBOARD_CHANNEL_ID,
    PRESENCE_MESSAGE_ID,
    loadJSON,
    saveJSON,
    updatePresenceTracker,
    requestPresenceUpdate,
    handlePresenceMessage,
    JOIN_REGEX,
    LEAVE_REGEX,
    SERVER_START_REGEX,
    getRateLimitState,
    resetRateLimitState
};
