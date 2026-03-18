const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('remove_achievement')
            .setDescription('Revoke an achievement from a user')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addStringOption(opt => opt.setName('achievement').setDescription('Advancement ID').setAutocomplete(true).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const advId = interaction.options.getString('achievement');
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        player.advancements = player.advancements.filter(a => a !== advId);
        embed.setTitle("🚫 Achievement Revoked")
            .setDescription(`Removed **${advId.replace(/_/g, ' ')}** from ${targetUser}.`);

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
