const { EmbedBuilder } = require('discord.js');
const { setLevel } = require('../../../leveling');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('set_level')
            .setDescription('Set a user\'s level')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addIntegerOption(opt => opt.setName('level').setDescription('The level to set').setMinValue(0).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const level = interaction.options.getInteger('level');

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        setLevel(userId, level);
        
        embed.setTitle("📈 Level Set")
            .setDescription(`Set ${targetUser}'s level to **${level}**.`);

        await interaction.reply({ embeds: [embed] });
    }
};
