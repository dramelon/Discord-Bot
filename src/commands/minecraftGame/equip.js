const { getPlayerData, savePlayerData, autocompleteToolHelper } = require('../../utils/minecraftData');

async function executeEquipLogic(interaction) {
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];
    const equipTarget = interaction.options.getString('tool');

    if (!equipTarget || equipTarget === 'none') {
        player.equipped.pickaxe = null;
        savePlayerData(allPlayerData);
        return await interaction.reply({ content: '🫳 You unequipped your pickaxe.', ephemeral: true });
    }

    const tool = player.tools.find(t => t.id === equipTarget);
    if (!tool) {
        return await interaction.reply({ content: `❌ You don't possess a tool with ID \`${equipTarget}\`!`, ephemeral: true });
    }

    player.equipped.pickaxe = tool.id;
    savePlayerData(allPlayerData);
    return await interaction.reply({ content: `✅ You equipped the **${tool.type.replace(/_/g, ' ')}** (Durability: ${tool.durability}/${tool.maxDurability})!`, ephemeral: true });
}

async function autocompleteEquipLogic(interaction) {
    await autocompleteToolHelper(interaction, t => t.durability > 0, [{ name: 'None (Unequip)', value: 'none' }]);
}

module.exports = {
    executeEquipLogic,
    autocompleteEquipLogic
};
