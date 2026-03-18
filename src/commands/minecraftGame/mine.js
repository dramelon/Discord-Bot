const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, getLootTable, checkAdvancements, broadcastAchievement } = require('../../utils/minecraftData');

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
    const equippedPickId = player.equipped.pickaxe;
    const equippedTool = player.tools.find(t => t.id === equippedPickId);
    
    const lootTable = getLootTable();
    const tierKey = equippedTool ? equippedTool.type : 'none';
    const tierLoot = lootTable[tierKey];

    if (!tierLoot) {
        return await interaction.reply({ content: `❌ Error: No loot table found for tier \`${tierKey}\`.`, ephemeral: true });
    }

    // Generate Loot
    const lootGained = {};
    const requestedBlocks = Math.min(amount, 1024);
    let blocksActuallyMined = 0;
    let toolBroke = false;

    for (let i = 0; i < requestedBlocks; i++) {
        if (equippedTool) {
            // Unbreaking Logic
            const unbreakingLevel = equippedTool.enchantments?.Unbreaking || 0;
            const chanceToDamage = 1 / (unbreakingLevel + 1);
            if (Math.random() < chanceToDamage) {
                equippedTool.durability--;
            }
            
            blocksActuallyMined++;
            
            const item = rollLoot(tierLoot);
            let count = Math.floor(Math.random() * (tierLoot[item].max - tierLoot[item].min + 1)) + tierLoot[item].min;

            // Fortune Logic
            const fortuneLevel = equippedTool.enchantments?.Fortune || 0;
            if (fortuneLevel > 0) {
                const multiplier = 1 + Math.floor(Math.random() * (fortuneLevel + 1));
                count *= multiplier;
            }

            lootGained[item] = (lootGained[item] || 0) + count;

            if (equippedTool.durability <= 0) {
                toolBroke = true;
                player.equipped.pickaxe = null;
                player.tools = player.tools.filter(t => t.id !== equippedPickId);
                break;
            }
        } else {
            blocksActuallyMined++;
            const item = rollLoot(tierLoot);
            const count = Math.floor(Math.random() * (tierLoot[item].max - tierLoot[item].min + 1)) + tierLoot[item].min;
            lootGained[item] = (lootGained[item] || 0) + count;
        }
    }

    player.stats.blocks_mined += blocksActuallyMined;
    for (const [item, count] of Object.entries(lootGained)) {
        player.inventory[item] = (player.inventory[item] || 0) + count;
    }

    // Check Advancements
    const allNewAchievements = [];
    for (const item of Object.keys(lootGained)) {
        const newAdvs = checkAdvancements(player, item);
        newAdvs.forEach(a => allNewAchievements.push(a));
    }

    savePlayerData(allPlayerData);

    const effLevel = equippedTool?.enchantments?.Efficiency || 0;
    const effStr = effLevel > 0 ? ` [Efficiency ${effLevel}]` : "";

    const embed = new EmbedBuilder()
        .setTitle(toolBroke ? "⚠️ Mining Interrupted: Tool Broke!" : "⛏️ Mining Result")
        .setColor(toolBroke ? 0xe74c3c : (equippedTool ? 0x7f8c8d : 0xe67e22))
        .setDescription(`${equipMsg}You mined **${blocksActuallyMined} blocks** using **${equippedTool ? equippedTool.type.replace(/_/g, " ") + effStr : "your bare hands"}**.`);

    const lootList = Object.entries(lootGained)
        .map(([item, count]) => `**${count}x ${item.replace(/_/g, ' ')}**`)
        .join('\n');

    embed.addFields({ name: '💎 Loot Gained', value: lootList || '_Nothing found..._' });

    await interaction.reply({ embeds: [embed] });

    if (allNewAchievements.length > 0) {
        for (const adv of allNewAchievements) {
            await broadcastAchievement(interaction, interaction.user, adv);
        }
    }
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
    const userId = interaction.user.id;
    const player = getPlayerData(userId)[userId];

    if (focusedOption.name === 'equip') {
        const choices = player.tools
            .filter(t => t.durability > 0)
            .map(t => ({ 
                name: `${t.type.replace(/_/g, ' ')} [${t.durability}/${t.maxDurability}] (ID: ${t.id})`, 
                value: t.id 
            }));
        
        choices.unshift({ name: 'None (Unequip)', value: 'none' });
        
        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()));
        await interaction.respond(filtered.slice(0, 25));
    }
}

module.exports = {
    executeMineLogic,
    autocompleteMineLogic
};
