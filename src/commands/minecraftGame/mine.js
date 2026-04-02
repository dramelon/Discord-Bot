const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { getPlayerData, savePlayerData, getLootTable, checkAdvancements, broadcastAchievement, autocompleteToolHelper } = require('../../utils/minecraftData');

async function executeMineLogic(interaction) {
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];
    const amount = interaction.options.getInteger('amount') || 1;

    // Instant Equip Logic
    const equipTarget = interaction.options.getString('equip');
    let equipMsg = '';
    
    if (equipTarget) {
        if (equipTarget === 'none') {
            player.equipped.pickaxe = null;
            equipMsg = '🫳 You unequipped your pickaxe.\n';
        } else {
            const tool = player.tools.find(t => t.id === equipTarget);
            if (tool) {
                player.equipped.pickaxe = tool.id;
                equipMsg = `✅ You equipped the **${tool.type.replace(/_/g, ' ')}**!\n`;
            }
        }
    }

    // Mining Logic
    const activeMining = interaction.client.activeMining || (interaction.client.activeMining = new Set());
    if (activeMining.has(userId)) {
        return await interaction.reply({ content: '❌ You are already mining! Please wait for your current session to finish.', ephemeral: true });
    }

    const HARDNESS_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'hardness.json');
    const TOOLS_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'tools.json');
    
    const hardnessData = JSON.parse(fs.readFileSync(HARDNESS_FILE, 'utf8'));
    const toolsTemplates = JSON.parse(fs.readFileSync(TOOLS_FILE, 'utf8'));
    
    const equippedPickId = player.equipped.pickaxe;
    const equippedTool = player.tools.find(t => t.id === equippedPickId);
    
    const lootTable = getLootTable();
    const tierKey = equippedTool ? equippedTool.type : 'none';
    const tierLoot = lootTable[tierKey];

    if (!tierLoot) {
        return await interaction.reply({ content: `❌ Error: No loot table found for tier \`${tierKey}\`.`, ephemeral: true });
    }

    await interaction.deferReply();
    activeMining.add(userId);

    // Calculate Speed
    let baseSpeed = 1.0;
    if (equippedTool && toolsTemplates[equippedTool.type]) {
        baseSpeed = toolsTemplates[equippedTool.type].speed || 1.0;
    }

    const effLevel = equippedTool?.enchantments?.Efficiency || 0;
    const mineSpeed = effLevel > 0 ? baseSpeed + (effLevel ** 2 + 1) : baseSpeed;

    const requestedBlocks = Math.min(amount, 16384); // Limit to 64 for progress tracking UX
    let blocksActuallyMined = 0;
    let toolBroke = false;
    const lootGained = {}; 

    // Categorization Sets
    const ORE_LIST = new Set([
        'raw_iron', 'raw_gold', 'raw_copper', 'coal', 'diamond', 'emerald', 'lapis', 'redstone',
        'iron_ingot', 'gold_ingot', 'copper_ingot',
        'iron_ore', 'gold_ore', 'copper_ore', 'coal_ore', 'diamond_ore', 'lapis_ore', 'redstone_ore', 'emerald_ore'
    ]);
    const BLOCK_LIST = new Set([
        'cobblestone', 'stone', 'dirt', 'gravel', 'deepslate', 'deepslate_cobblestone', 'sand', 'obsidian'
    ]);

    const silkTouchMap = {
        'cobblestone': 'stone', 'coal': 'coal_ore', 'raw_iron': 'iron_ore',
        'raw_gold': 'gold_ore', 'raw_copper': 'copper_ore', 'diamond': 'diamond_ore',
        'lapis': 'lapis_ore', 'redstone': 'redstone_ore'
    };

    const autoSmeltMap = {
        'raw_iron': 'iron_ingot', 'raw_gold': 'gold_ingot', 'raw_copper': 'copper_ingot'
    };

    const startTime = Date.now();
    let lastUpdate = startTime;
    try {
        for (let i = 0; i < requestedBlocks; i++) {
            // Find current block hardness (guess based on loot table or just use stone)
            let item = rollLoot(tierLoot);

            // Diamond Rarity Logic
            if (item === 'diamond' && (!player.advancements || !player.advancements.includes('getting_diamond'))) {
                if (Math.random() > 0.10) { // 90% chance to "fail" (1 in 10 success)
                    item = 'cobblestone'; // Replaced with common junk
                }
            }

            const hardness = hardnessData[item] || 1.5;
            
            // Calculate delay: (hard * 1.5 / speed) * 1000
            // If hand-mining stone/ores, it's 5x slower (approximation)
            let effectiveSpeed = mineSpeed;
            if (!equippedTool && hardness > 1.0) effectiveSpeed *= 0.2; 
            
            const delay = Math.max(100, (hardness * 1.5 / effectiveSpeed) * 1000);
            await new Promise(resolve => setTimeout(resolve, delay));

            if (equippedTool) {
                const unbreakingLevel = equippedTool.enchantments?.Unbreaking || 0;
                if (Math.random() < (1 / (unbreakingLevel + 1))) equippedTool.durability--;
            }

            blocksActuallyMined++;
            let baseCount = Math.floor(Math.random() * (tierLoot[item].max - tierLoot[item].min + 1)) + tierLoot[item].min;
            let currentCount = baseCount;
            let currentFortune = 0;

            const hasSilkTouch = (equippedTool?.enchantments?.['Silk Touch'] || 0) > 0;
            const hasAutoSmelt = (equippedTool?.enchantments?.['Auto Smelt'] || 0) > 0;
            const fortuneLevel = equippedTool?.enchantments?.Fortune || 0;

            if (hasSilkTouch && silkTouchMap[item]) {
                item = silkTouchMap[item];
            } else {
                if (fortuneLevel > 0 && ['coal', 'raw_iron', 'raw_gold', 'raw_copper', 'diamond', 'lapis', 'redstone'].includes(item)) {
                    const multiplier = 1 + Math.floor(Math.random() * (fortuneLevel + 1));
                    currentCount = baseCount * multiplier;
                    currentFortune = currentCount - baseCount;
                }
                if (hasAutoSmelt && autoSmeltMap[item]) item = autoSmeltMap[item];
            }

            if (!lootGained[item]) lootGained[item] = { total: 0, fortune: 0 };
            lootGained[item].total += currentCount;
            lootGained[item].fortune += currentFortune;

            // Dynamic Progress Update Frequency
            const now = Date.now();
            const elapsedSec = (now - startTime) / 1000;
            let threshold = 10000; // Default 10s
            if (elapsedSec < 5) threshold = 1000;
            else if (elapsedSec < 30) threshold = 3000;

            if (now - lastUpdate >= threshold || blocksActuallyMined === requestedBlocks) {
                lastUpdate = now;
                const progress = Math.round((blocksActuallyMined / requestedBlocks) * 100);
                const bar = '▓'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
                
                const progressEmbed = new EmbedBuilder()
                    .setTitle('⛏️ Mining in Progress...')
                    .setColor(0x3498db)
                    .setDescription(`**Progress:** [${bar}] ${progress}%\n**Planned:** ${requestedBlocks} blocks\n**Mined:** ${blocksActuallyMined} blocks`);

                formatLootFields(progressEmbed, lootGained, ORE_LIST, BLOCK_LIST);
                await interaction.editReply({ embeds: [progressEmbed] });
            }

            if (equippedTool && equippedTool.durability <= 0) {
                toolBroke = true;
                player.equipped.pickaxe = null;
                player.tools = player.tools.filter(t => t.id !== equippedPickId);
                break;
            }
        }
    } finally {
        activeMining.delete(userId);
    }

    // Wrap up results
    player.stats.blocks_mined += blocksActuallyMined;
    for (const [item, data] of Object.entries(lootGained)) {
        player.inventory[item] = (player.inventory[item] || 0) + data.total;
    }

    const allNewAchievements = [];
    for (const item of Object.keys(lootGained)) {
        const newAdvs = checkAdvancements(player, item);
        newAdvs.forEach(a => allNewAchievements.push(a));
    }

    savePlayerData(allPlayerData);

    const effStr = effLevel > 0 ? ` [Efficiency ${effLevel}]` : '';
    const resultEmbed = new EmbedBuilder()
        .setTitle(toolBroke ? '⚠️ Mining Interrupted: Tool Broke!' : '⛏️ Mining Finished')
        .setColor(toolBroke ? 0xe74c3c : (equippedTool ? 0x2ecc71 : 0xe67e22))
        .setDescription(`${equipMsg}You mined **${blocksActuallyMined} blocks** using **${equippedTool ? equippedTool.type.replace(/_/g, ' ') + effStr : 'your bare hands'}**.`);

    formatLootFields(resultEmbed, lootGained, ORE_LIST, BLOCK_LIST);

    await interaction.editReply({ embeds: [resultEmbed] });

    if (allNewAchievements.length > 0) {
        for (const adv of allNewAchievements) await broadcastAchievement(interaction, interaction.user, adv);
    }
}

function formatLootFields(embed, lootGained, ORE_LIST, BLOCK_LIST) {
    const ores = []; const blocks = []; const items = [];
    for (const [name, data] of Object.entries(lootGained)) {
        const entry = { name, ...data };
        if (ORE_LIST.has(name)) ores.push(entry);
        else if (BLOCK_LIST.has(name)) blocks.push(entry);
        else items.push(entry);
    }
    const sortFn = (a, b) => b.total - a.total;
    ores.sort(sortFn); blocks.sort(sortFn); items.sort(sortFn);

    const formatEntry = (e) => `**${e.total}x ${e.name.replace(/_/g, ' ')}**${e.fortune > 0 ? ` (+${e.fortune} fortune)` : ''}`;
    
    if (ores.length > 0) embed.addFields({ name: '💎 Ores', value: ores.slice(0, 10).map(formatEntry).join('\n') + (ores.length > 10 ? '\n*and more...*' : '') });
    if (blocks.length > 0) embed.addFields({ name: '🧱 Blocks', value: blocks.slice(0, 10).map(formatEntry).join('\n') + (blocks.length > 10 ? '\n*and more...*' : '') });
    if (items.length > 0) embed.addFields({ name: '📦 Items', value: items.slice(0, 10).map(formatEntry).join('\n') + (items.length > 10 ? '\n*and more...*' : '') });
}

function rollLoot(tierLoot) {
    const totalWeight = Object.values(tierLoot).reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [item, data] of Object.entries(tierLoot)) {
        random -= data.weight;
        if (random <= 0) return item;
    }
    return Object.keys(tierLoot)[0];
}

async function autocompleteMineLogic(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'equip') {
        await autocompleteToolHelper(interaction, t => t.durability > 0, [{ name: 'None (Unequip)', value: 'none' }]);
    }
}

module.exports = {
    executeMineLogic,
    autocompleteMineLogic
};
