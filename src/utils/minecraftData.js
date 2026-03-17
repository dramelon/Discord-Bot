const fs = require('fs');
const path = require('path');

const MINECRAFT_DIR = path.join(process.cwd(), 'data', 'minecraft');
const PLAYER_DATA_DIR = path.join(MINECRAFT_DIR, 'playerData');
const CORE_DATA_DIR = path.join(MINECRAFT_DIR, 'core');

const PLAYERS_FILE = path.join(PLAYER_DATA_DIR, 'players.json');
const CORE_FILE = path.join(CORE_DATA_DIR, 'minecraft.json');
const RECIPE_FILE = path.join(CORE_DATA_DIR, 'recipe.json');
const LOOT_FILE = path.join(CORE_DATA_DIR, 'loot.json');
const TOOLS_FILE = path.join(CORE_DATA_DIR, 'tools.json');
const SMELTERY_FILE = path.join(CORE_DATA_DIR, 'smeltery.json');
// Levels handled by ../leveling.js
const ADVANCEMENT_FILE = path.join(CORE_DATA_DIR, 'advancements.json');

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
            tools: [], // New unique tools storage
            equipped: {
                pickaxe: null // This will store the tool ID
            },
            furnaces: [], // Array of { input, fuel, result, currentHeat, progressMs, lastTick }
            stats: {
                trees_chopped: 0,
                blocks_mined: 0
            },
            unlocked_recipes: [],
            advancements: []
        };
    }

    // Migration and fixes
    const player = data[userId];
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
    const newUnlocks = [];
    const newAchievements = [];

    for (const [id, adv] of Object.entries(advancements)) {
        if (player.advancements.includes(id)) continue;

        if (adv.trigger.item === itemGained) {
            player.advancements.push(id);
            newAchievements.push(adv);
            
            adv.unlocks.forEach(recipe => {
                if (!player.unlocked_recipes.includes(recipe)) {
                    player.unlocked_recipes.push(recipe);
                }
            });
        }
    }

    return newAchievements;
}

async function autocompleteToolHelper(interaction) {
    const userId = interaction.user.id;
    const player = getPlayerData(userId)[userId];
    const focusedValue = interaction.options.getFocused().toLowerCase();

    if (!player.tools || player.tools.length === 0) {
        return await interaction.respond([{ name: "No tools owned (use /minecraft craft)", value: "none" }]);
    }

    const filtered = player.tools
        .filter(t => t.type.toLowerCase().includes(focusedValue) || t.id.toLowerCase().includes(focusedValue))
        .map(t => {
            const enchantStr = t.enchantments ? ` [Enchanted: ${Object.keys(t.enchantments).join(', ')}]` : '';
            return {
                name: `${t.type.replace(/_/g, ' ')} (${t.durability}/${t.maxDurability}) [ID: ${t.id}]${enchantStr}`,
                value: t.id
            };
        })
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
    getAdvancementData
};
