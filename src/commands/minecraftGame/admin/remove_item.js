const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('remove_item')
            .setDescription('Remove an item from a user')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addStringOption(opt => opt.setName('item').setDescription('Item ID').setAutocomplete(true).setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('How many').setMinValue(1)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const item = interaction.options.getString('item');
        const amount = interaction.options.getInteger('amount') || 1;
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        if (player.inventory[item]) {
            player.inventory[item] = Math.max(0, player.inventory[item] - amount);
            embed.setTitle("🗑️ Items Removed")
                .setDescription(`Removed up to **${amount}x ${item.replace(/_/g, ' ')}** from ${targetUser}.`);
        } else {
            return await interaction.reply({ content: `❌ User doesn't have any **${item}** in their inventory.`, ephemeral: true });
        }

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
