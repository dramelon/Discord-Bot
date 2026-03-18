const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('clear')
            .setDescription('Clear a user\'s inventory')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        player.inventory = {};
        embed.setTitle("🧹 Inventory Cleared")
            .setDescription(`Cleared all stackable items from ${targetUser}'s inventory.`);

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
