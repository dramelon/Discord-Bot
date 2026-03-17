const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, autocompleteToolHelper } = require('../../utils/minecraftData');

async function executeDisenchantLogic(interaction) {
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    const toolId = interaction.options.getString('tool');
    const toolIndex = player.tools.findIndex(t => t.id === toolId);

    if (toolIndex === -1) {
        return await interaction.reply({ content: "❌ That tool no longer exists.", ephemeral: true });
    }

    const tool = player.tools[toolIndex];
    if (!tool.enchantments || Object.keys(tool.enchantments).length === 0) {
        return await interaction.reply({ content: "❌ This tool is not enchanted!", ephemeral: true });
    }

    // Clear enchantments
    delete tool.enchantments;

    savePlayerData(allPlayerData);

    const embed = new EmbedBuilder()
        .setTitle("🕯️ Tool Disenchanted")
        .setColor(0x7f8c8d)
        .setDescription(`Stripped all magical energies from your **${tool.type.replace(/_/g, ' ')}**.`)
        .setFooter({ text: "Items used in enchanting are not returned." });

    await interaction.reply({ embeds: [embed] });
}

async function autocompleteDisenchantLogic(interaction) {
    await autocompleteToolHelper(interaction);
}

module.exports = {
    executeDisenchantLogic,
    autocompleteDisenchantLogic
};
