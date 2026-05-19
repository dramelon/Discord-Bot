const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const dataPath = path.join(__dirname, '../../data/socialactivity.json');
const TARGET_GUILD = '1447192381479976993';
const TARGET_CHANNEL = '1504641296747462840';
const TARGET_MESSAGE = '1504650859374448843';

// Helper to read data
function readData() {
    try {
        if (!fs.existsSync(dataPath)) {
            return {
                emojis: {}, emojiUsers: {},
                stickers: {}, stickerUsers: {},
                voice: { totalSessions: 0, longestSession: 0, latestSession: 0 },
                voiceChannels: {}, voiceUsers: {}, activeSessions: {}, activeChannels: {}
            };
        }
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (!data.activeChannels) data.activeChannels = {};
        return data;
    } catch (err) {
        console.error('Error reading socialactivity.json:', err);
        return null;
    }
}

// Helper to write data
function writeData(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing socialactivity.json:', err);
    }
}

function handleMessage(message) {
    if (!message.guild || message.guild.id !== TARGET_GUILD || message.author.bot) return;

    let data = readData();
    if (!data) return;
    let modified = false;

    // Track Stickers
    if (message.stickers && message.stickers.size > 0) {
        message.stickers.forEach(sticker => {
            const stickerId = sticker.id;
            
            let current = data.stickers[stickerId] || { count: 0, name: sticker.name };
            // Migration for old integers
            if (typeof current === 'number') current = { count: current, name: 'Unknown Sticker' };
            
            current.count += 1;
            if (sticker.name) current.name = sticker.name;
            
            data.stickers[stickerId] = current;
            data.stickerUsers[message.author.id] = (data.stickerUsers[message.author.id] || 0) + 1;
            modified = true;
        });
    }

    // Track Emojis in message
    if (message.content) {
        const customMatches = message.content.match(/<a?:.+?:\d+>/g);
        const unicodeMatches = message.content.match(/\p{Emoji_Presentation}/gu);

        let emojiCount = 0;
        if (customMatches) {
            customMatches.forEach(emoji => {
                data.emojis[emoji] = (data.emojis[emoji] || 0) + 1;
                emojiCount++;
            });
        }
        if (unicodeMatches) {
            unicodeMatches.forEach(emoji => {
                data.emojis[emoji] = (data.emojis[emoji] || 0) + 1;
                emojiCount++;
            });
        }

        if (emojiCount > 0) {
            data.emojiUsers[message.author.id] = (data.emojiUsers[message.author.id] || 0) + emojiCount;
            modified = true;
        }
    }

    if (modified) writeData(data);
}

function handleReaction(reaction, user) {
    if (!reaction.message.guild || reaction.message.guild.id !== TARGET_GUILD || user.bot) return;

    // Ignore if message is older than 3 days
    const ageMs = Date.now() - reaction.message.createdTimestamp;
    if (ageMs > 3 * 24 * 60 * 60 * 1000) return;

    let data = readData();
    if (!data) return;

    const emojiStr = reaction.emoji.id ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    
    data.emojis[emojiStr] = (data.emojis[emojiStr] || 0) + 1;
    data.emojiUsers[user.id] = (data.emojiUsers[user.id] || 0) + 1;

    writeData(data);
}

function handleVoiceState(oldState, newState) {
    if (newState.guild.id !== TARGET_GUILD) return;
    if (newState.member?.user?.bot) return;

    let data = readData();
    if (!data) return;

    const userId = newState.member.id;
    const now = Date.now();
    let modified = false;

    // Left a channel
    if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
        const session = data.activeSessions[userId];
        if (session && session.channelId === oldState.channelId) {
            const durationMs = now - session.joinTime;
            const durationMin = Math.floor(durationMs / 60000);

            if (durationMin > 0) {
                // Update channel and user totals
                data.voiceChannels[oldState.channelId] = (data.voiceChannels[oldState.channelId] || 0) + durationMin;
                data.voiceUsers[userId] = (data.voiceUsers[userId] || 0) + durationMin;
                
                // Update global stats
                data.voice.totalSessions += 1;
                data.voice.latestSession = durationMin;
                if (durationMin > data.voice.longestSession) {
                    data.voice.longestSession = durationMin;
                }
            }
            delete data.activeSessions[userId];
            modified = true;
        }
        
        // Active Channels handling
        if (data.activeChannels && data.activeChannels[oldState.channelId]) {
            let ac = data.activeChannels[oldState.channelId];
            ac.users = ac.users.filter(u => u !== userId);
            ac.logs.unshift({ type: 'left', userId, timestamp: now });
            if (ac.logs.length > 20) ac.logs.pop();
            
            if (ac.users.length === 0) {
                delete data.activeChannels[oldState.channelId];
            }
            modified = true;
        }
    }

    // Joined a channel
    if (newState.channelId && (!oldState.channelId || oldState.channelId !== newState.channelId)) {
        data.activeSessions[userId] = {
            channelId: newState.channelId,
            joinTime: now
        };
        modified = true;
        
        // Active Channels handling
        if (!data.activeChannels) data.activeChannels = {};
        if (!data.activeChannels[newState.channelId]) {
            data.activeChannels[newState.channelId] = { startTime: now, users: [], totalJoins: 0, logs: [], userJoinList: [] };
        }
        let ac = data.activeChannels[newState.channelId];
        if (!ac.users.includes(userId)) ac.users.push(userId);
        
        if (!ac.userJoinList) ac.userJoinList = [];
        if (!ac.userJoinList.find(u => u.userId === userId)) {
            ac.userJoinList.unshift({ userId, joinTime: now });
        }
        
        ac.totalJoins += 1;
        ac.logs.unshift({ type: 'join', userId, timestamp: now });
        if (ac.logs.length > 20) ac.logs.pop();
    }

    if (modified) writeData(data);
}

function getTopItems(obj, limit = 10, formatFn) {
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map((entry) => formatFn(entry[0], entry[1]))
        .join('\n') || 'No data yet.';
}

async function updateStatusMessage(client) {
    const data = readData();
    if (!data) return;

    try {
        const guild = await client.guilds.fetch(TARGET_GUILD).catch(() => null);
        const channel = await client.channels.fetch(TARGET_CHANNEL);
        if (!channel) return;
        const message = await channel.messages.fetch(TARGET_MESSAGE);
        if (!message) return;

        // --- Embed 1: Emoji Usage ---
        let localEmojis = {};
        let externalEmojis = {};
        
        Object.entries(data.emojis).forEach(([emojiStr, count]) => {
            const customMatch = emojiStr.match(/<a?:.+?:(\d+)>/);
            if (customMatch) {
                const id = customMatch[1];
                if (!client.emojis.cache.has(id)) {
                    externalEmojis[emojiStr] = count;
                } else {
                    localEmojis[emojiStr] = count;
                }
            } else {
                localEmojis[emojiStr] = count;
            }
        });

        const topEmojisStr = getTopItems(localEmojis, 10, (id, count) => `**${count}** : ${id}`);
        const topExternalEmojisStr = getTopItems(externalEmojis, 5, (id, count) => {
            const nameMatch = id.match(/<a?:(.+?):\d+>/);
            return nameMatch ? `**${count}** : ${nameMatch[1]}` : `**${count}** : ${id}`;
        });
        const topEmojiUsersStr = getTopItems(data.emojiUsers, 10, (id, count) => `**${count}** : <@${id}>`);

        const emojiEmbed = new EmbedBuilder()
            .setTitle('✨ Emoji Leaderboard ✨')
            .setColor('#FFB7C5')
            .addFields(
                { name: '🏆 Top Emojis', value: topEmojisStr, inline: true },
                { name: '🌐 External Emojis', value: topExternalEmojisStr, inline: true },
                { name: '🗣️ Top Users', value: topEmojiUsersStr, inline: true }
            )
            .setFooter({ text: 'Social Activity Tracking • Emojis' })
            .setTimestamp();

        // --- Embed 2: Sticker Usage ---
        let localStickers = {};
        let externalStickers = {};

        Object.entries(data.stickers).forEach(([id, stickerData]) => {
            const count = typeof stickerData === 'number' ? stickerData : stickerData.count;
            const name = typeof stickerData === 'number' ? 'Unknown Sticker' : stickerData.name;
            
            if (guild && guild.stickers.cache.has(id)) {
                localStickers[id] = { count, name };
            } else {
                externalStickers[id] = { count, name };
            }
        });

        const topStickersStr = Object.entries(localStickers)
            .sort((a, b) => b[1].count - a[1].count).slice(0, 10)
            .map((entry) => `**${entry[1].count}** : [${entry[1].name}](https://cdn.discordapp.com/stickers/${entry[0]}.png)`)
            .join('\n') || 'No data yet.';

        const topExternalStickersStr = Object.entries(externalStickers)
            .sort((a, b) => b[1].count - a[1].count).slice(0, 5)
            .map((entry) => `**${entry[1].count}** : [${entry[1].name}](https://cdn.discordapp.com/stickers/${entry[0]}.png)`)
            .join('\n') || 'No data yet.';

        const topStickerUsersStr = getTopItems(data.stickerUsers, 10, (id, count) => `**${count}** : <@${id}>`);

        const stickerEmbed = new EmbedBuilder()
            .setTitle('🎨 Sticker Leaderboard 🎨')
            .setColor('#A7C7E7')
            .addFields(
                { name: '🏆 Top Stickers', value: topStickersStr, inline: true },
                { name: '🌐 External Stickers', value: topExternalStickersStr, inline: true },
                { name: '🗣️ Top Users', value: topStickerUsersStr, inline: true }
            )
            .setFooter({ text: 'Social Activity Tracking • Stickers' })
            .setTimestamp();

        // --- Embed 3+: Active VC Sessions ---
        const activeVcEmbeds = [];
        if (data.activeChannels) {
            for (const [vcId, vcData] of Object.entries(data.activeChannels)) {
                const sessionLengthMin = Math.floor((Date.now() - vcData.startTime) / 60000);
                const currentUsers = vcData.users.length;
                const totalJoins = vcData.totalJoins;
                
                const logsStr = vcData.logs.map(log => {
                    const action = log.type === 'join' ? 'Joined' : 'Left';
                    return `• <t:${Math.floor(log.timestamp / 1000)}:R> : <@${log.userId}> ${action}`;
                }).join('\n') || 'No logs yet.';
                
                const joinListStr = (vcData.userJoinList || []).slice(0, 20).map(u => {
                    return `<t:${Math.floor(u.joinTime / 1000)}:t> : <@${u.userId}>`;
                }).join('\n') || 'No users.';
                
                const generalStatus = `**Session Length:** ${sessionLengthMin}m\n**Current Users:** ${currentUsers}\n**Total Joins:** ${totalJoins}`;
                
                const vcEmbed = new EmbedBuilder()
                    .setTitle(`🟢 Active Session: <#${vcId}>`)
                    .setColor('#FFD700')
                    .addFields(
                        { name: '📊 Status', value: generalStatus, inline: true },
                        { name: '📜 Recent Activity', value: logsStr, inline: true },
                        { name: '👥 User Join List', value: joinListStr, inline: true }
                    )
                    .setTimestamp();
                activeVcEmbeds.push(vcEmbed);
            }
        }

        // --- Embed Last: Voice Activity Leaderboard ---
        const vcStatus = `**Total Sessions:** ${data.voice.totalSessions}\n**Longest Session:** ${data.voice.longestSession} mins\n**Latest Session:** ${data.voice.latestSession} mins`;
        const topChannelsStr = getTopItems(data.voiceChannels, 10, (id, mins) => `**${mins}m** : <#${id}>`);
        const topVoiceUsersStr = getTopItems(data.voiceUsers, 10, (id, mins) => `**${mins}m** : <@${id}>`);

        const voiceEmbed = new EmbedBuilder()
            .setTitle('🎙️ Voice Activity 🎙️')
            .setColor('#C1E1C1')
            .addFields(
                { name: '📊 Status Overview', value: vcStatus, inline: true },
                { name: '🏆 Top Channels', value: topChannelsStr, inline: true },
                { name: '🗣️ Top Users', value: topVoiceUsersStr, inline: true }
            )
            .setFooter({ text: 'Social Activity Tracking • Voice' })
            .setTimestamp();

        // Assemble all embeds
        const embeds = [emojiEmbed, stickerEmbed, ...activeVcEmbeds, voiceEmbed];

        // Edit the message
        await message.edit({ embeds });
    } catch (err) {
        console.error('Failed to update social activity message:', err);
    }
}

let intervalId = null;

function startActivityTracking(client) {
    if (intervalId) return; // already tracking

    // Run every 30 seconds
    intervalId = setInterval(() => {
        updateStatusMessage(client);
    }, 30 * 1000);
}

module.exports = {
    handleMessage,
    handleReaction,
    handleVoiceState,
    startActivityTracking
};
