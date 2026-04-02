const { getPlayerData, savePlayerData, getToolDisplayName } = require('../../utils/minecraftData');

async function executeRenameLogic(interaction) {
    const userId = interaction.user.id;
    const toolId = interaction.options.getString('tool');
    const newName = interaction.options.getString('name');

    const allData = getPlayerData(userId);
    const player = allData[userId];

    if (!player.tools || player.tools.length === 0) {
        return await interaction.reply({ content: '❌ You don\'t have any tools to rename!', ephemeral: true });
    }

    const tool = player.tools.find(t => t.id === toolId);
    if (!tool) {
        return await interaction.reply({ content: '❌ Could not find that tool.', ephemeral: true });
    }

    const oldNameFormatted = getToolDisplayName(tool);
    
    if (!newName) {
        // Reset name
        delete tool.displayName;
        savePlayerData(allData);
        return await interaction.reply({ content: `✅ Reset **${oldNameFormatted}** back to its original name.` });
    }

    tool.displayName = newName;
    savePlayerData(allData);

    return await interaction.reply({ content: `✅ Renamed **${oldNameFormatted}** to **${newName}**!` });
}

async function autocompleteRenameLogic(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const userId = interaction.user.id;
    const player = getPlayerData(userId)[userId];

    if (!player.tools) return await interaction.respond([]);

    const choices = player.tools.map(t => ({
        name: `${getToolDisplayName(t).replace(/\*/g, '')} (ID: ${t.id})`,
        value: t.id
    }));

    const filtered = choices.filter(c => c.name.toLowerCase().includes(focusedValue));
    await interaction.respond(filtered.slice(0, 25));
}

module.exports = {
    executeRenameLogic,
    autocompleteRenameLogic
};
