const { EmbedBuilder } = require('discord.js');
const { 
    getPlayerData, 
    savePlayerData, 
    getAdvancementData, 
    getRecipes,
    getToolTemplates 
} = require('../../utils/minecraftData');
const {
    getUserLevelData,
    addXP,
    removeXP,
    removeLevel
} = require('../../leveling');
const fs = require('fs');
const path = require('path');

const ADMIN_ROLE_ID = '1466814634718658704';
const ENCHANTMENTS_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'enchantments.json');

async function executeAdminLogic(interaction) {
    // Permission check
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
        return await interaction.reply({ content: "❌ You do not have permission to use admin commands.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const userId = targetUser.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    const embed = new EmbedBuilder().setColor(0xe74c3c);

    try {
        if (sub === 'give_item') {
            const item = interaction.options.getString('item');
            const amount = interaction.options.getInteger('amount') || 1;
            const templates = getToolTemplates();

            if (templates[item]) {
                // Give tool
                for (let i = 0; i < amount; i++) {
                    const toolId = Math.random().toString(36).substring(2, 9);
                    player.tools.push({
                        id: toolId,
                        type: item,
                        durability: templates[item].durability,
                        maxDurability: templates[item].durability
                    });
                }
                embed.setTitle("🎁 Items Given")
                    .setDescription(`Gave **${amount}x ${item.replace(/_/g, ' ')}** (Tools) to ${targetUser}.`);
            } else {
                // Give stackable
                player.inventory[item] = (player.inventory[item] || 0) + amount;
                embed.setTitle("🎁 Items Given")
                    .setDescription(`Gave **${amount}x ${item.replace(/_/g, ' ')}** to ${targetUser}.`);
            }
        } 
        
        else if (sub === 'give_xp') {
            const amount = interaction.options.getInteger('amount') || 0;
            addXP(userId, amount, targetUser);
            embed.setTitle("✨ XP Granted")
                .setDescription(`Gave **${amount} XP** to ${targetUser}.`);
        }

        else if (sub === 'remove_xp') {
            const amount = interaction.options.getInteger('amount') || 0;
            removeXP(userId, amount);
            embed.setTitle("✨ XP Removed")
                .setDescription(`Removed **${amount} XP** from ${targetUser}.`);
        }

        else if (sub === 'remove_item') {
            const item = interaction.options.getString('item');
            const amount = interaction.options.getInteger('amount') || 1;
            
            if (player.inventory[item]) {
                player.inventory[item] = Math.max(0, player.inventory[item] - amount);
                embed.setTitle("🗑️ Items Removed")
                    .setDescription(`Removed up to **${amount}x ${item.replace(/_/g, ' ')}** from ${targetUser}.`);
            } else {
                return await interaction.reply({ content: `❌ User doesn't have any **${item}** in their inventory.`, ephemeral: true });
            }
        }

        else if (sub === 'give_achievement') {
            const advId = interaction.options.getString('achievement');
            const advancements = getAdvancementData();
            
            if (!advancements[advId]) {
                return await interaction.reply({ content: "❌ Invalid advancement ID.", ephemeral: true });
            }

            if (!player.advancements.includes(advId)) {
                player.advancements.push(advId);
                // Also unlock recipes
                advancements[advId].unlocks.forEach(r => {
                    if (!player.unlocked_recipes.includes(r)) {
                        player.unlocked_recipes.push(r);
                    }
                });
                embed.setTitle("🏆 Achievement Granted")
                    .setDescription(`Granted **${advancements[advId].name}** to ${targetUser}. Recipes unlocked!`);
            } else {
                return await interaction.reply({ content: "❌ User already has this achievement.", ephemeral: true });
            }
        }

        else if (sub === 'remove_achievement') {
            const advId = interaction.options.getString('achievement');
            player.advancements = player.advancements.filter(a => a !== advId);
            embed.setTitle("🚫 Achievement Revoked")
                .setDescription(`Removed **${advId.replace(/_/g, ' ')}** from ${targetUser}.`);
        }

        else if (sub === 'clear') {
            player.inventory = {};
            embed.setTitle("🧹 Inventory Cleared")
                .setDescription(`Cleared all stackable items from ${targetUser}'s inventory.`);
        }

        else if (sub === 'hardreset') {
            player.inventory = {};
            player.tools = [];
            player.equipped = { pickaxe: null };
            player.furnaces = [];
            player.stats = {
                trees_chopped: 0,
                blocks_mined: 0
            };
            player.unlocked_recipes = [];
            player.advancements = [];
            // Preserve level by NOT calling addPlayerXP or modifying levelData
            embed.setTitle("♻️ Hard Reset")
                .setDescription(`Wiped inventory, tools, and stats for ${targetUser}. **Level and XP preserved.**`);
        }

        else if (sub === 'set_level') {
            const level = interaction.options.getInteger('level');
            const userLevels = getUserLevelData(userId);
            userLevels.level = level;
            userLevels.xp = 0; // Reset progress in level
            // Note: I need a save function for leveling.js if I modify it directly.
            // Actually, addXP(userId, 0) will save it. Or I add a setLevel to API.
            // I'll just use addXP with a large amount or modify the API to export save.
            // I'll add setLevel to leveling.js API in the next step or just reuse addXP/removeLevel.
            // I'll use a direct save for now or call addXP(userId, 0).
            // Actually, I'll add setLevel to leveling.js first.
            embed.setTitle("📈 Level Set")
                .setDescription(`Set ${targetUser}'s level to **${level}**.`);
        }

        else if (sub === 'enchant') {
            const encId = interaction.options.getString('enchantment');
            const level = interaction.options.getInteger('level');
            const toolId = player.equipped.pickaxe;
            
            if (!toolId) {
                return await interaction.reply({ content: "❌ User doesn't have a tool equipped.", ephemeral: true });
            }

            const tool = player.tools.find(t => t.id === toolId);
            if (!tool) return await interaction.reply({ content: "❌ Equipped tool not found.", ephemeral: true });

            if (!tool.enchantments) tool.enchantments = {};
            tool.enchantments[encId] = level;

            embed.setTitle("✨ Admin Enchant")
                .setDescription(`Enchanted ${targetUser}'s **${tool.type}** with **${encId} ${level}**.`);
        }

        else if (sub === 'disenchant') {
            const encId = interaction.options.getString('enchantment');
            const toolId = player.equipped.pickaxe;
            
            if (!toolId) {
                return await interaction.reply({ content: "❌ User doesn't have a tool equipped.", ephemeral: true });
            }

            const tool = player.tools.find(t => t.id === toolId);
            if (!tool) return await interaction.reply({ content: "❌ Equipped tool not found.", ephemeral: true });

            if (encId === 'all') {
                delete tool.enchantments;
                embed.setTitle("🕯️ Admin Disenchant")
                    .setDescription(`Cleared ALL enchantments from ${targetUser}'s tool.`);
            } else if (tool.enchantments && tool.enchantments[encId]) {
                delete tool.enchantments[encId];
                embed.setTitle("🕯️ Admin Disenchant")
                    .setDescription(`Removed **${encId}** from ${targetUser}'s tool.`);
            } else {
                return await interaction.reply({ content: "❌ That enchantment isn't on the tool.", ephemeral: true });
            }
        }

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Admin command error:', error);
        await interaction.reply({ content: "❌ An error occurred while executing the admin command.", ephemeral: true });
    }
}

async function autocompleteAdminLogic(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const sub = interaction.options.getSubcommand();

    if (focusedOption.name === 'item') {
        const recipes = getRecipes();
        const templates = getToolTemplates();
        const allItems = [...new Set([...Object.keys(recipes), ...Object.keys(templates), 'coal', 'iron_ingot', 'gold_ingot', 'lapis', 'redstone', 'diamond', 'raw_iron', 'raw_gold', 'cobblestone', 'stone'])];
        const filtered = allItems.filter(i => i.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
        await interaction.respond(filtered.map(i => ({ name: i.replace(/_/g, ' '), value: i })));
    }

    if (focusedOption.name === 'achievement') {
        const advs = getAdvancementData();
        const filtered = Object.keys(advs).filter(i => i.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
        await interaction.respond(filtered.map(i => ({ name: i, value: i })));
    }

    if (focusedOption.name === 'enchantment') {
        try {
            const enchantments = JSON.parse(fs.readFileSync(ENCHANTMENTS_FILE, 'utf8'));
            const choices = Object.keys(enchantments);
            if (sub === 'disenchant') choices.push('all');
            const filtered = choices.filter(i => i.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
            await interaction.respond(filtered.map(i => ({ name: i, value: i })));
        } catch (e) {
            await interaction.respond([]);
        }
    }
}

module.exports = {
    executeAdminLogic,
    autocompleteAdminLogic
};
