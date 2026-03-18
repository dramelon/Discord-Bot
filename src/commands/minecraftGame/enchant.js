const { EmbedBuilder } = require('discord.js');
const { 
    getPlayerData, 
    savePlayerData, 
    autocompleteToolHelper 
} = require('../../utils/minecraftData');
const { 
    getUserLevelData, 
    removeLevel 
} = require('../../leveling');
const fs = require('fs');
const path = require('path');

const ENCHANTMENTS_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'enchantments.json');

async function executeEnchantLogic(interaction) {
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];
    const userLevelData = getUserLevelData(userId);

    const toolId = interaction.options.getString('tool');
    const toolIndex = player.tools.findIndex(t => t.id === toolId);

    if (toolIndex === -1) {
        return await interaction.reply({ content: "❌ That tool no longer exists.", ephemeral: true });
    }

    const tool = player.tools[toolIndex];
    if (tool.enchantments && Object.keys(tool.enchantments).length > 0) {
        return await interaction.reply({ content: "❌ This tool is already enchanted! Use `/minecraft disenchant` first.", ephemeral: true });
    }

    if (userLevelData.level < 5) {
        return await interaction.reply({ content: "❌ You need at least **Level 5** to enchant tools!", ephemeral: true });
    }

    const lapisStock = player.inventory.lapis || 0;
    if (lapisStock < 3) {
        return await interaction.reply({ content: "❌ You need at least **3x Lapis Lazuli** to enchant!", ephemeral: true });
    }

    // Load Enchantments
    const enchantments = JSON.parse(fs.readFileSync(ENCHANTMENTS_FILE, 'utf8'));

    // Deduct cost: 3 Levels, 3 Lapis
    removeLevel(userId, 3);

    // Deduct Lapis
    player.inventory.lapis -= 3;
    
    // Get new level for footer
    const newLevel = getUserLevelData(userId).level;

    // Pick a random enchantment based on weight
    const enchantList = Object.keys(enchantments);
    const totalWeight = enchantList.reduce((sum, key) => sum + enchantments[key].weight, 0);
    let random = Math.random() * totalWeight;
    let selectedEnchant = enchantList[0];

    for (const key of enchantList) {
        if (random < enchantments[key].weight) {
            selectedEnchant = key;
            break;
        }
        random -= enchantments[key].weight;
    }

    // Random power 1-3
    const power = Math.floor(Math.random() * 3) + 1;
    
    tool.enchantments = {
        [selectedEnchant]: Math.min(power, enchantments[selectedEnchant].max_level)
    };
    tool.timesEnchanted = (tool.timesEnchanted || 0) + 1;

    // Save all
    savePlayerData(allPlayerData);

    const embed = new EmbedBuilder()
        .setTitle("✨ Tool Enchanted")
        .setColor(0x9b59b6)
        .setDescription(`The enchanting table glows with mystical energy!`)
        .addFields(
            { name: "⚒️ Tool", value: tool.type.replace(/_/g, ' '), inline: true },
            { name: "🔮 Enchantment", value: `**${selectedEnchant} ${'I'.repeat(tool.enchantments[selectedEnchant])}**`, inline: true },
            { name: "📉 Cost", value: `3 Levels & 3 Lapis`, inline: true }
        )
        .setFooter({ text: `Current Level: ${newLevel}` });

    await interaction.reply({ embeds: [embed] });
}

async function autocompleteEnchantLogic(interaction) {
    await autocompleteToolHelper(interaction);
}

module.exports = {
    executeEnchantLogic,
    autocompleteEnchantLogic
};
