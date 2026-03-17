const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, autocompleteToolHelper } = require('../../utils/minecraftData');

const REPAIR_MATERIALS = {
    'wooden_pickaxe': 'oak_planks',
    'stone_pickaxe': 'cobblestone',
    'iron_pickaxe': 'iron_ingot',
    'gold_pickaxe': 'gold_ingot',
    'diamond_pickaxe': 'diamond',
    'netherite_pickaxe': 'netherite_ingot'
};

async function executeRepairLogic(interaction) {
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    const toolId = interaction.options.getString('tool');
    const toolIndex = player.tools.findIndex(t => t.id === toolId);

    if (toolIndex === -1) {
        return await interaction.reply({ content: "❌ That tool no longer exists in your collection.", ephemeral: true });
    }

    const tool = player.tools[toolIndex];
    if (tool.durability >= tool.maxDurability) {
        return await interaction.reply({ content: "❌ This tool is already at full durability!", ephemeral: true });
    }

    const material = REPAIR_MATERIALS[tool.type];
    if (!material) {
        return await interaction.reply({ content: `❌ This tool type (**${tool.type}**) cannot be repaired.`, ephemeral: true });
    }

    const stock = player.inventory[material] || 0;
    if (stock <= 0) {
        return await interaction.reply({ 
            content: `❌ You need at least **1x ${material.replace(/_/g, ' ')}** to repair this tool!`, 
            ephemeral: true 
        });
    }

    // Repair 33% of max
    const repairAmount = Math.floor(tool.maxDurability * 0.33);
    const oldDurability = tool.durability;
    tool.durability = Math.min(tool.durability + repairAmount, tool.maxDurability);
    
    // Consume 1 material
    player.inventory[material]--;

    savePlayerData(allPlayerData);

    const embed = new EmbedBuilder()
        .setTitle("🛠️ Tool Repaired")
        .setColor(0x3498db)
        .setDescription(`You used 1x **${material.replace(/_/g, ' ')}** to repair your **${tool.type.replace(/_/g, ' ')}**.`)
        .addFields(
            { name: "🛡️ Durability", value: `\`${oldDurability}\` ➡️ \`${tool.durability}/${tool.maxDurability}\``, inline: true },
            { name: "📈 Restored", value: `+${tool.durability - oldDurability} units`, inline: true }
        );

    await interaction.reply({ embeds: [embed] });
}

async function autocompleteRepairLogic(interaction) {
    await autocompleteToolHelper(interaction);
}

module.exports = {
    executeRepairLogic,
    autocompleteRepairLogic
};
