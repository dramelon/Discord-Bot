const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'customStickers', 'stickers.json');
const STICKERS_DIR = path.join(process.cwd(), 'data', 'customStickers', 'files');
const TARGET_GUILD_ID = '1492101995094610062';
const STICKER_LIMIT = 5;

function getStickers() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveStickers(stickers) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(stickers, null, 2), 'utf8');
}

/**
 * Normalizes sticker data and synchronizes with the target server using LRU.
 * @param {import('discord.js').Client} client 
 * @param {string} usedStickerName Name of the sticker just used/uploaded
 */
async function syncToDiscord(client, usedStickerName) {
    try {
        const stickers = getStickers();
        const usedSticker = stickers.find(s => s.name === usedStickerName);
        if (!usedSticker) return;

        // Update lastUsedAt
        const now = Date.now();
        usedSticker.lastUsedAt = now;
        saveStickers(stickers);

        const guild = await client.guilds.fetch(TARGET_GUILD_ID);
        if (!guild) {
            console.error(`Target guild ${TARGET_GUILD_ID} not found.`);
            return;
        }

        // Get Top 5 stickers based on lastUsedAt (desc)
        const sortedStickers = [...stickers].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
        const target5 = sortedStickers.slice(0, STICKER_LIMIT);
        const target5Names = target5.map(s => s.name);

        // Fetch current stickers from guild
        const guildStickers = await guild.stickers.fetch();
        
        // 1. Delete stickers from guild that are NOT in target5
        for (const [id, gs] of guildStickers) {
            if (!target5Names.includes(gs.name)) {
                try {
                    await guild.stickers.delete(gs, 'LRU: Removing older sticker');
                    // Update local data
                    const local = stickers.find(s => s.name === gs.name);
                    if (local) local.discordStickerId = null;
                } catch (e) {
                    console.error(`Failed to delete sticker ${gs.name}:`, e);
                }
            }
        }

        // 2. Upload stickers that are in target5 but missing from guild
        for (const ts of target5) {
            const exists = guildStickers.some(gs => gs.name === ts.name);
            if (!exists) {
                try {
                    const filePath = path.join(STICKERS_DIR, ts.filename);
                    if (fs.existsSync(filePath)) {
                        const newSticker = await guild.stickers.create({
                            file: filePath,
                            name: ts.name,
                            tags: ts.name, // Required field
                            reason: 'LRU: Adding recently used sticker'
                        });
                        ts.discordStickerId = newSticker.id;
                    }
                } catch (e) {
                    console.error(`Failed to upload sticker ${ts.name}:`, e);
                }
            } else {
                // Ensure local discordStickerId is correct
                const gs = guildStickers.find(g => g.name === ts.name);
                ts.discordStickerId = gs.id;
            }
        }

        saveStickers(stickers);
    } catch (error) {
        console.error('Sticker Sync Error:', error);
    }
}

module.exports = { syncToDiscord, getStickers, saveStickers };
