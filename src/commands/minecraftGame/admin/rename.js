const { getPlayerData, savePlayerData, getToolDisplayName } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) => 
        subcommand
            .setName('rename')
            .setDescription('Admin: Rename any user\'s tool')
            .addStringOption(option =>
                option.setName('user_tool')
                    .setDescription('The user and tool to rename (Autocomplete)')
                    .setAutocomplete(true)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('The new name for the tool (leave empty to reset)')
                    .setRequired(false)
            ),

    async execute(interaction) {
        const userToolValue = interaction.options.getString('user_tool');
        const newName = interaction.options.getString('name');

        if (!userToolValue.includes(':')) {
            return await interaction.reply({ content: '❌ Invalid user_tool format. Please use the autocomplete choices.', ephemeral: true });
        }

        const [targetUserId, toolId] = userToolValue.split(':');
        const allData = getPlayerData(targetUserId);
        const player = allData[targetUserId];

        if (!player || !player.tools) {
            return await interaction.reply({ content: '❌ Target user data not found or has no tools.', ephemeral: true });
        }

        const tool = player.tools.find(t => t.id === toolId);
        if (!tool) {
            return await interaction.reply({ content: `❌ Could not find tool with ID \`${toolId}\` for this user.`, ephemeral: true });
        }

        const oldName = getToolDisplayName(tool);

        if (!newName) {
            delete tool.displayName;
            savePlayerData(allData);
            return await interaction.reply({ content: `✅ Reset tool \`${toolId}\` for user <@${targetUserId}> back to original name.` });
        }

        tool.displayName = newName;
        savePlayerData(allData);

        return await interaction.reply({ content: `✅ Renamed tool \`${toolId}\` for user <@${targetUserId}> from **${oldName}** to **${newName}**!` });
    }
};
