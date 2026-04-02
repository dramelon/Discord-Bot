const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, autocompleteToolHelper, addPlayerXP } = require('../../utils/minecraftData');

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

    // Calculate XP back: sum 2^(x-1) where x is level (Fortune x is level + 2)
    let totalXpGained = 0;
    for (const [name, level] of Object.entries(tool.enchantments)) {
        let x = level;
        if (name === 'Fortune') x += 2;
        totalXpGained += Math.pow(2, x - 1);
    }
    totalXpGained = Math.floor(totalXpGained);

    // Clear enchantments
    delete tool.enchantments;
    
    // Add XP back
    addPlayerXP(userId, totalXpGained, interaction.user, interaction);

    savePlayerData(allPlayerData);

    const embed = new EmbedBuilder()
        .setTitle('🕯️ Tool Disenchanted')
        .setColor(0x7f8c8d)
        .setDescription(`Stripped all magical energies from your **${tool.type.replace(/_/g, ' ')}**.`)
        .addFields({ name: '✨ XP Returned', value: `+${totalXpGained} XP`, inline: true })
        .setFooter({ text: 'The table has refunded some of your mystical energy.' });

    await interaction.reply({ embeds: [embed] });
}

async function autocompleteDisenchantLogic(interaction) {
    await autocompleteToolHelper(interaction, t => t.enchantments && Object.keys(t.enchantments).length > 0);
}

module.exports = {
    executeDisenchantLogic,
    autocompleteDisenchantLogic
};
