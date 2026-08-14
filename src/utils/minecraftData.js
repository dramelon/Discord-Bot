const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dbManager = require('../backend/dbManager');

const MINECRAFT_DIR = path.join(process.cwd(), 'data', 'minecraft');
const PLAYER_DATA_DIR = path.join(MINECRAFT_DIR, 'playerData');
const CORE_DATA_DIR = path.join(MINECRAFT_DIR, 'core');

const CORE_FILE = path.join(CORE_DATA_DIR, 'minecraft.json');
const RECIPE_FILE = path.join(CORE_DATA_DIR, 'recipe.json');
const LOOT_FILE = path.join(CORE_DATA_DIR, 'loot.json');
const TOOLS_FILE = path.join(CORE_DATA_DIR, 'tools.json');
const SMELTERY_FILE = path.join(CORE_DATA_DIR, 'smeltery.json');
const ADVANCEMENT_FILE = path.join(CORE_DATA_DIR, 'advancements.json');

// Ensure directories and files exist
function ensureExists() {
    [MINECRAFT_DIR, PLAYER_DATA_DIR, CORE_DATA_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    if (!fs.existsSync(CORE_FILE)) {
        fs.writeFileSync(CORE_FILE, JSON.stringify({ last_updated: new Date().toISOString() }), 'utf8');
    }
}

function getPlayerData(userId) {
    ensureExists();
    const player = dbManager.getPlayerData(userId);
    
    // Migration and fixes
    if (!player.tools) player.tools = [];
    if (!player.equipped) player.equipped = { pickaxe: null };
    if (!player.furnaces) player.furnaces = [];
    if (!player.unlocked_recipes) player.unlocked_recipes = [];
    if (!player.advancements) player.advancements = [];
    
    // Migration: If they have furnace in inventory but no furnace slots, initialize them
    const furnaceCount = player.inventory.furnace || 0;
    while (player.furnaces.length < furnaceCount) {
        player.furnaces.push({
            input: null,
            fuel: null,
            result: null,
            currentHeat: 0,
            progressMs: 0,
            lastTick: Date.now()
        });
    }

    // Cleanup old fields
    delete player.furnace_heat;
    delete player.last_smelt_finish;

    if (!player.stats) player.stats = { trees_chopped: 0, blocks_mined: 0 };

    // Migrate old pickaxes from inventory to tools array
    const toolTemplates = getToolTemplates();
    Object.keys(player.inventory).forEach(item => {
        if (item.includes('pickaxe') && player.inventory[item] > 0) {
            const count = player.inventory[item];
            const template = toolTemplates[item];
            
            for (let i = 0; i < count; i++) {
                const toolId = Math.random().toString(36).substring(2, 9);
                player.tools.push({
                    id: toolId,
                    type: item,
                    durability: template ? template.durability : 100,
                    maxDurability: template ? template.durability : 100
                });
                
                // If this was the equipped item type, equip the first one migrated
                if (player.equipped.pickaxe === item) {
                    player.equipped.pickaxe = toolId;
                }
            }
            player.inventory[item] = 0; // Clear from stackable inventory
        }
    });

    return { [userId]: player };
}

function savePlayerData(data) {
    ensureExists();
    try {
        const userId = Object.keys(data)[0];
        if (userId) {
            dbManager.savePlayerData(userId, data[userId]);
        }
    } catch (e) {
        console.error('Error saving player data to SQLite:', e);
    }
}

function getRecipes() {
    if (!fs.existsSync(RECIPE_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(RECIPE_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading recipe.json:', e);
        return {};
    }
}

function getLootTable() {
    if (!fs.existsSync(LOOT_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(LOOT_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading loot.json:', e);
        return {};
    }
}

function getToolTemplates() {
    if (!fs.existsSync(TOOLS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(TOOLS_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading tools.json:', e);
        return {};
    }
}

function getSmelteryData() {
    if (!fs.existsSync(SMELTERY_FILE)) return { recipes: {}, fuels: {} };
    try {
        return JSON.parse(fs.readFileSync(SMELTERY_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading smeltery.json:', e);
        return { recipes: {}, fuels: {} };
    }
}

/**
 * Ticks all furnaces for a player to process smelting progress offline.
 */
function tickFurnaces(player) {
    const { recipes, fuels } = getSmelteryData();
    const now = Date.now();

    player.furnaces.forEach(f => {
        if (!f.input || f.input.amount <= 0) {
            f.lastTick = now;
            f.progressMs = 0;
            return;
        }

        const recipe = recipes[f.input.item];
        if (!recipe) {
            f.lastTick = now;
            return;
        }

        let elapsedMs = now - f.lastTick;
        f.lastTick = now;

        // Total time already spent + elapsed
        let totalTimeMs = f.progressMs + elapsedMs;
        const MS_PER_ITEM = 10000;

        while (totalTimeMs >= MS_PER_ITEM && f.input.amount > 0) {
            // Check if we have heat or can burn fuel
            if (f.currentHeat < 1.0) {
                if (f.fuel && f.fuel.amount > 0) {
                    const fuelPower = fuels[f.fuel.item] || 0;
                    if (fuelPower > 0) {
                        f.fuel.amount--;
                        f.currentHeat += fuelPower;
                        if (f.fuel.amount <= 0) f.fuel = null;
                    } else {
                        // Fuel has no power, stop smelting
                        break;
                    }
                } else {
                    // No fuel to burn, stop smelting
                    break;
                }
            }

            // Consume heat and produce result
            f.currentHeat -= 1.0;
            f.input.amount--;
            
            if (!f.result) {
                f.result = { item: recipe.result, amount: 0 };
            }
            f.result.amount += recipe.yield;
            
            totalTimeMs -= MS_PER_ITEM;

            // Cleanup if finished
            if (f.input.amount <= 0) {
                f.input = null;
                totalTimeMs = 0;
                break;
            }
        }
        
        f.progressMs = f.input ? totalTimeMs : 0;
    });
}

const { 
    getUserLevelData: getLevelData, 
    addXP: addPlayerXP,
    getXPRequired
} = require('../leveling');

function getToolDisplayName(tool) {
    let baseName = tool.type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    // Add "Enchanted" prefix if the tool has enchantments
    if (tool.enchantments && Object.keys(tool.enchantments).length > 0) {
        baseName = `Enchanted ${baseName}`;
    }
    
    if (tool.displayName) {
        return `*${tool.displayName}* (${baseName})`;
    }
    
    return baseName;
}

function getAdvancementData() {
    if (!fs.existsSync(ADVANCEMENT_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(ADVANCEMENT_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function checkAdvancements(player, itemGained) {
    const advancements = getAdvancementData();
    const newAchievements = [];

    for (const [id, adv] of Object.entries(advancements)) {
        if (player.advancements.includes(id)) continue;

        if (adv.trigger.item === itemGained) {
            player.advancements.push(id);
            newAchievements.push(adv);
            
            if (adv.unlocks) {
                adv.unlocks.forEach(recipe => {
                    if (!player.unlocked_recipes.includes(recipe)) {
                        player.unlocked_recipes.push(recipe);
                    }
                });
            }
        }
    }

    return newAchievements;
}

/**
 * Broadcasts an achievement in a separate message
 */
async function broadcastAchievement(context, user, achievement) {
    const embed = new EmbedBuilder()
        .setTitle('🏆 Advancement Reached!')
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setDescription(`**${achievement.name}**\n*${achievement.description}*`)
        .addFields({ name: '🔓 Unlocked Recipes', value: achievement.unlocks.join(', ').replace(/_/g, ' ') })
        .setColor(0xf1c40f);
    try {
        const channel = context.channel;
        if (channel) {
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('Error broadcasting achievement:', e);
    }
}

async function autocompleteToolHelper(interaction, filterFn = null, extraChoices = []) {
    const userId = interaction.user.id;
    const player = getPlayerData(userId)[userId];
    const focusedValue = interaction.options.getFocused().toLowerCase();

    if (!player || !player.tools || player.tools.length === 0) {
        if (extraChoices.length > 0) {
            const filteredExtra = extraChoices.filter(c => c.name.toLowerCase().includes(focusedValue));
            return await interaction.respond(filteredExtra.slice(0, 25));
        }
        return await interaction.respond([{ name: 'No tools owned (use /minecraft craft)', value: 'none' }]);
    }

    let tools = player.tools;
    if (filterFn) {
        tools = tools.filter(filterFn);
    }

    const toolChoices = tools
        .map(t => {
            const displayName = getToolDisplayName(t).replace(/\*/g, '');
            return {
                name: `${displayName} (${t.durability}/${t.maxDurability}) [ID: ${t.id}]`,
                value: t.id
            };
        });

    const allChoices = [...extraChoices, ...toolChoices];
    const filtered = allChoices
        .filter(choice => choice.name.toLowerCase().includes(focusedValue))
        .slice(0, 25);

    await interaction.respond(filtered);
}

module.exports = {
    getPlayerData,
    savePlayerData,
    getRecipes,
    getLootTable,
    getToolTemplates,
    getSmelteryData,
    tickFurnaces,
    getLevelData,
    addPlayerXP,
    autocompleteToolHelper,
    checkAdvancements,
    getAdvancementData,
    getToolDisplayName,
    broadcastAchievement
};
