const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuration
const TRACKING_CHANNEL_ID = '1506242621415231519';
const WEBHOOK_USER_ID = '1508476744955461734';
const SCOREBOARD_CHANNEL_ID = '1509573689061150770';
const SCOREBOARD_MESSAGE_ID = '1509573708354818229';
const COMBAT_MESSAGE_ID = '1509837014109786222';

// File Paths (Isolate test data when running test suite)
const DATA_DIR = process.env.NODE_ENV === 'test'
    ? path.join(process.cwd(), 'data', 'minecraft_test')
    : path.join(process.cwd(), 'data', 'minecraft');
const TRACKER_FILE = path.join(DATA_DIR, 'achievements_tracker.json');
const DISCOVERED_FILE = path.join(DATA_DIR, 'discovered_achievements.json');
const MAP_FILE = path.join(DATA_DIR, 'username_map.json');

// Regexes
const ADVANCEMENT_REGEX = /(?<username>\S+)\s+has (?:made the advancement|reached the goal|completed the challenge) \s*\*{0,2}\[(?<advancement>[^\]]+)\]\*{0,2}(?::\s*(?<description>.*))?/i;


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
        console.error(`[AchievementTracker] Failed to read/parse ${path.basename(filePath)}:`, error);
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
        console.error(`[AchievementTracker] Failed to save ${path.basename(filePath)}:`, error);
    }
}

/**
 * Update the scoreboard message with current statistics and leaderboard ranking.
 */
async function updateScoreboard(client) {
    try {
        const trackerData = loadJSON(TRACKER_FILE, { players: {}, lastUpdated: 0 });
        const discoveredData = loadJSON(DISCOVERED_FILE, {});
        const mapData = loadJSON(MAP_FILE, {});

        const totalUnique = Object.keys(discoveredData).length;
        let totalUnlocked = 0;

        const playersList = Object.entries(trackerData.players).map(([username, data]) => {
            totalUnlocked += (data.achievements || []).length;
            return {
                username,
                count: (data.achievements || []).length,
                lastUpdated: data.lastUpdated || 0,
                lastAchievement: (data.achievements || [])[(data.achievements || []).length - 1]
            };
        });

        // Sort: most achievements first. If tie, who achieved their last advancement first (older lastUpdated timestamp).
        playersList.sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.lastUpdated - b.lastUpdated;
        });

        // --- EMBED 1: Leaderboard & Stats ---
        const embed1 = new EmbedBuilder()
            .setTitle('🏆 MINECRAFT ACHIEVEMENT LEADERBOARD')
            .setDescription('Live stats and achievement tracking directly from the Minecraft server!')
            .setColor(0xF1C40F) // Gold
            .setTimestamp();

        embed1.addFields({
            name: '📊 Server Statistics',
            value: `• **Total Unique Advancements Discovered**: ${totalUnique}\n• **Total Advancements Claimed**: ${totalUnlocked}`,
            inline: false
        });

        let leaderboardText = '';
        if (playersList.length === 0) {
            leaderboardText = '*No achievements tracked yet. Go get some advancements!*';
        } else {
            leaderboardText = playersList.map((p, index) => {
                const rankEmojis = ['🥇', '🥈', '🥉'];
                const rankEmoji = rankEmojis[index] || '👤';
                
                const mappedKey = Object.keys(mapData).find(k => k.toLowerCase() === p.username.toLowerCase());
                const discordId = mappedKey ? mapData[mappedKey] : null;
                const displayName = discordId ? `<@${discordId}>` : `\`${p.username}\``;
                
                let line = `${rankEmoji} ${displayName} — **${p.count}** ${p.count === 1 ? 'advancement' : 'advancements'}`;
                if (p.lastAchievement) {
                    line += `\n└ *Last: [${p.lastAchievement.name}]*`;
                }
                return line;
            }).join('\n\n');
        }

        embed1.addFields({
            name: '📈 Top Players',
            value: leaderboardText,
            inline: false
        });

        // --- EMBED 2: Recent Activity (Up to 20 latest) ---
        const activities = [];
        Object.entries(trackerData.players).forEach(([username, data]) => {
            (data.achievements || []).forEach(a => {
                activities.push({
                    username,
                    name: a.name,
                    timestamp: a.timestamp
                });
            });
        });

        activities.sort((a, b) => b.timestamp - a.timestamp);
        const recentActivities = activities.slice(0, 20);

        let recentActivityText = '';
        if (recentActivities.length === 0) {
            recentActivityText = '*No recent activity recorded yet.*';
        } else {
            recentActivityText = recentActivities.map(act => {
                const mappedKey = Object.keys(mapData).find(k => k.toLowerCase() === act.username.toLowerCase());
                const discordId = mappedKey ? mapData[mappedKey] : null;
                const displayName = discordId ? `<@${discordId}>` : `\`${act.username}\``;
                const timeSecs = Math.floor(act.timestamp / 1000);
                return `<t:${timeSecs}:f> - ${displayName} completed **[${act.name}]**`;
            }).join('\n');
        }

        const embed2 = new EmbedBuilder()
            .setTitle('🕒 RECENT ACTIVITY')
            .setDescription(recentActivityText)
            .setColor(0xF1C40F) // Gold
            .setTimestamp();

        // Fetch and edit scoreboard message
        const channel = await client.channels.fetch(SCOREBOARD_CHANNEL_ID);
        if (!channel) return;

        const message = await channel.messages.fetch(SCOREBOARD_MESSAGE_ID);
        if (!message) return;

        await message.edit({ embeds: [embed1, embed2] });
        console.log(`[AchievementTracker] Scoreboard message edited successfully.`);
    } catch (error) {
        console.error(`[AchievementTracker] Failed to update scoreboard message:`, error);
    }
}

/**
 * Update the combat scoreboard message with deaths statistics.
 * Shows only death statistics and ranks players based on most deaths.
 */
async function updateCombatTracker(client) {
    try {
        const trackerData = loadJSON(TRACKER_FILE, { players: {}, lastUpdated: 0 });
        const mapData = loadJSON(MAP_FILE, {});

        // Fetch and rank lists
        const deathsList = Object.entries(trackerData.players)
            .map(([username, p]) => ({
                username,
                deaths: p.deaths || 0,
                lastDeath: p.lastDeath || null,
                lastUpdated: p.lastUpdated || 0
            }))
            .filter(p => p.deaths > 0)
            .sort((a, b) => {
                if (b.deaths !== a.deaths) {
                    return b.deaths - a.deaths;
                }
                return a.lastUpdated - b.lastUpdated; // Tie-breaker: oldest lastUpdated first
            });

        const totalDeaths = Object.values(trackerData.players).reduce((sum, p) => sum + (p.deaths || 0), 0);

        const embed = new EmbedBuilder()
            .setTitle('💀 MINECRAFT DEATH LEADERBOARD')
            .setDescription('Live death statistics directly from the Minecraft server!')
            .setColor(0xE74C3C) // Crimson Red
            .setTimestamp();

        // 1. Server Statistics
        embed.addFields({
            name: '📊 Server Statistics',
            value: `• **Total Deaths Recorded**: ${totalDeaths}`,
            inline: false
        });

        // 2. Leaderboard
        let deathsText = '';
        if (deathsList.length === 0) {
            deathsText = '*No player deaths recorded yet.*';
        } else {
            deathsText = deathsList.map((p, index) => {
                const rankEmojis = ['🥇', '🥈', '🥉'];
                const rankEmoji = rankEmojis[index] || '👤';
                const mappedKey = Object.keys(mapData).find(k => k.toLowerCase() === p.username.toLowerCase());
                const discordId = mappedKey ? mapData[mappedKey] : null;
                const displayName = discordId ? `<@${discordId}>` : `\`${p.username}\``;
                
                let line = `${rankEmoji} ${displayName} — **${p.deaths}** ${p.deaths === 1 ? 'death' : 'deaths'}`;
                if (p.lastDeath && p.lastDeath.message) {
                    line += `\n└ *Last: ${p.lastDeath.message}*`;
                }
                return line;
            }).join('\n\n');
        }

        embed.addFields({
            name: '💀 Deaths Leaderboard',
            value: deathsText,
            inline: false
        });

        // Fetch and edit scoreboard message (COMBAT_MESSAGE_ID)
        const channel = await client.channels.fetch(SCOREBOARD_CHANNEL_ID);
        if (!channel) return;

        const message = await channel.messages.fetch(COMBAT_MESSAGE_ID);
        if (!message) return;

        await message.edit({ embeds: [embed] });
        console.log(`[AchievementTracker] Death scoreboard message edited successfully.`);
    } catch (error) {
        console.error(`[AchievementTracker] Failed to update death scoreboard message:`, error);
    }
}

/**
 * Update the server presence message with online players and recent join/leave logs.
 */
// Rate-limiting state variables (Achievements)
let updateCooldownActive = false;
let updatePending = false;
let cooldownTimer = null;

// Rate-limiting state variables (Deaths)
let combatCooldownActive = false;
let combatPending = false;
let combatCooldownTimer = null;

/**
 * Request an update to the achievements scoreboard.
 */
async function requestScoreboardUpdate(client) {
    if (!updateCooldownActive) {
        updateCooldownActive = true;
        updatePending = false;
        await updateScoreboard(client);
        cooldownTimer = setTimeout(async () => {
            updateCooldownActive = false;
            cooldownTimer = null;
            if (updatePending) {
                await requestScoreboardUpdate(client);
            }
        }, 15000);
    } else {
        updatePending = true;
    }
}

/**
 * Request an update to the death scoreboard.
 */
async function requestCombatUpdate(client) {
    if (!combatCooldownActive) {
        combatCooldownActive = true;
        combatPending = false;
        await updateCombatTracker(client);
        combatCooldownTimer = setTimeout(async () => {
            combatCooldownActive = false;
            combatCooldownTimer = null;
            if (combatPending) {
                await requestCombatUpdate(client);
            }
        }, 15000);
    } else {
        combatPending = true;
    }
}


/**
 * Handle new messages to track Minecraft achievements, deaths, joins, and leaves.
 */
async function handleAchievementMessage(message) {
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

    let achievementsChanged = false;
    let combatChanged = false;

    // Load current databases
    const trackerData = loadJSON(TRACKER_FILE, { players: {}, lastUpdated: 0 });
    const discoveredData = loadJSON(DISCOVERED_FILE, {});
    const mapData = loadJSON(MAP_FILE, {});

    // Utility to ensure player is initialized in database
    const ensurePlayerState = (username) => {
        let playerKey = Object.keys(trackerData.players).find(
            k => k.toLowerCase() === username.toLowerCase()
        );
        if (!playerKey) {
            playerKey = username;
            trackerData.players[playerKey] = {
                achievements: [],
                deaths: 0,
                kills: 0,
                lastUpdated: 0
            };
        }
        if (trackerData.players[playerKey].deaths === undefined) trackerData.players[playerKey].deaths = 0;
        if (trackerData.players[playerKey].kills === undefined) trackerData.players[playerKey].kills = 0;
        return playerKey;
    };

    for (const text of textsToProcess) {

        // C. Check if it's an advancement
        const advMatch = text.match(ADVANCEMENT_REGEX);
        if (advMatch) {
            const { username, advancement, description } = advMatch.groups;
            if (username && advancement) {
                const cleanUsername = username.trim();
                const cleanAdvancement = advancement.trim();
                const cleanDescription = description ? description.trim() : '';

                // Add to discovered catalog
                let discoveredKey = Object.keys(discoveredData).find(
                    k => k.toLowerCase() === cleanAdvancement.toLowerCase()
                );
                if (!discoveredKey) {
                    discoveredKey = cleanAdvancement;
                    discoveredData[discoveredKey] = {
                        description: cleanDescription,
                        firstDiscoveredBy: cleanUsername,
                        firstDiscoveredAt: Date.now(),
                        unlockedBy: [
                            {
                                username: cleanUsername,
                                timestamp: Date.now()
                            }
                        ]
                    };
                    achievementsChanged = true;
                } else {
                    if (cleanDescription && !discoveredData[discoveredKey].description) {
                        discoveredData[discoveredKey].description = cleanDescription;
                        achievementsChanged = true;
                    }

                    if (!discoveredData[discoveredKey].unlockedBy) {
                        discoveredData[discoveredKey].unlockedBy = [];
                    }

                    const alreadyUnlocked = discoveredData[discoveredKey].unlockedBy.some(
                        u => u.username.toLowerCase() === cleanUsername.toLowerCase()
                    );

                    if (!alreadyUnlocked) {
                        discoveredData[discoveredKey].unlockedBy.push({
                            username: cleanUsername,
                            timestamp: Date.now()
                        });
                        achievementsChanged = true;
                    }
                }

                // Find or create player and add achievement
                const playerKey = ensurePlayerState(cleanUsername);
                const alreadyCompleted = trackerData.players[playerKey].achievements.some(
                    a => a.name.toLowerCase() === cleanAdvancement.toLowerCase()
                );

                if (!alreadyCompleted) {
                    trackerData.players[playerKey].achievements.push({
                        name: cleanAdvancement,
                        timestamp: Date.now()
                    });
                    trackerData.players[playerKey].lastUpdated = Date.now();
                    trackerData.lastUpdated = Date.now();
                    achievementsChanged = true;
                    console.log(`[AchievementTracker] Tracked new advancement: ${cleanUsername} unlocked [${cleanAdvancement}]`);
                }
            }
            continue;
        }

        // D. Check if it's a death message
        // 1. PvP / PvE Kill (e.g. "_drameloN was slain by wasabliss")
        const killerMatch = text.match(/(?<victim>\S+)\s+(?:was slain|was shot|was killed|was blown up|was burnt|was pierced|was stabbed|was mauled|was shoved|was pushed|was thrown|was plunged|was pricked|was stung) by (?<killer>.+)/i);
        if (killerMatch) {
            const { victim } = killerMatch.groups;
            if (victim) {
                const cleanVictim = victim.trim();

                // Increment death for victim
                const victimKey = ensurePlayerState(cleanVictim);
                trackerData.players[victimKey].deaths++;
                trackerData.players[victimKey].lastUpdated = Date.now();

                // Clean the death message string (strip player name from the beginning)
                const cleanDeathMsg = text.replace(new RegExp(`^${cleanVictim}\\s+`, 'i'), '').trim();
                trackerData.players[victimKey].lastDeath = {
                    message: cleanDeathMsg,
                    timestamp: Date.now()
                };

                trackerData.lastUpdated = Date.now();
                combatChanged = true;
                console.log(`[AchievementTracker] Death: ${cleanVictim} killed (slain by killer pattern)`);
            }
            continue;
        }

        // 2. Generic environmental death (e.g. "_drameloN hit the ground too hard")
        const genericDeathMatch = text.match(/(?<victim>\S+)\s+(?:was killed|hit the ground too hard|drowned|fell from|burned|flames|swim in lava|suffocated|starved|died|was pricked|was squished|was squashed|blew up|went off with a bang)/i);
        if (genericDeathMatch) {
            const { victim } = genericDeathMatch.groups;
            if (victim) {
                const cleanVictim = victim.trim();
                const victimKey = ensurePlayerState(cleanVictim);
                trackerData.players[victimKey].deaths++;
                trackerData.players[victimKey].lastUpdated = Date.now();

                // Save the latest death message
                const cleanDeathMsg = text.replace(new RegExp(`^${cleanVictim}\\s+`, 'i'), '').trim();
                trackerData.players[victimKey].lastDeath = {
                    message: cleanDeathMsg,
                    timestamp: Date.now()
                };

                trackerData.lastUpdated = Date.now();
                combatChanged = true;
                console.log(`[AchievementTracker] Death: ${cleanVictim} died of environmental damage`);
            }
        }
    }

    if (achievementsChanged || combatChanged) {
        saveJSON(TRACKER_FILE, trackerData);
        saveJSON(DISCOVERED_FILE, discoveredData);
    }

    if (achievementsChanged) {
        await requestScoreboardUpdate(message.client);
    }

    if (combatChanged) {
        await requestCombatUpdate(message.client);
    }
}

// Clean up helper for testing rate limits
function getRateLimitState() {
    return {
        updateCooldownActive,
        updatePending,
        cooldownTimer,
        combatCooldownActive,
        combatPending,
        combatCooldownTimer
    };
}

// Clean up helper for resetting rate limit timers in tests
function resetRateLimitState() {
    if (cooldownTimer) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
    }
    if (combatCooldownTimer) {
        clearTimeout(combatCooldownTimer);
        combatCooldownTimer = null;
    }
    updateCooldownActive = false;
    updatePending = false;
    combatCooldownActive = false;
    combatPending = false;
}

module.exports = {
    TRACKING_CHANNEL_ID,
    WEBHOOK_USER_ID,
    SCOREBOARD_CHANNEL_ID,
    SCOREBOARD_MESSAGE_ID,
    COMBAT_MESSAGE_ID,
    loadJSON,
    saveJSON,
    updateScoreboard,
    updateCombatTracker,
    requestScoreboardUpdate,
    requestCombatUpdate,
    handleAchievementMessage,
    ADVANCEMENT_REGEX,
    getRateLimitState,
    resetRateLimitState
};
