const { EmbedBuilder } = require('discord.js');
const { addXP } = require('../../../leveling');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('give_xp')
            .setDescription('Give XP to a user')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setMinValue(1).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const amount = interaction.options.getInteger('amount');

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        addXP(userId, amount, targetUser);
        
        embed.setTitle("✨ XP Granted")
            .setDescription(`Gave **${amount} XP** to ${targetUser}.`);

        await interaction.reply({ embeds: [embed] });
    }
};
