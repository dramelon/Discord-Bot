const { EmbedBuilder } = require('discord.js');
const { removeXP } = require('../../../leveling');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('remove_xp')
            .setDescription('Remove XP from a user')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setMinValue(1).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const amount = interaction.options.getInteger('amount');

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        removeXP(userId, amount);
        
        embed.setTitle("✨ XP Removed")
            .setDescription(`Removed **${amount} XP** from ${targetUser}.`);

        await interaction.reply({ embeds: [embed] });
    }
};
