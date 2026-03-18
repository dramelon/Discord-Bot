const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, getToolTemplates } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('give_item')
            .setDescription('Give an item to a user')
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
        const templates = getToolTemplates();

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        if (templates[item]) {
            for (let i = 0; i < amount; i++) {
                const toolId = Math.random().toString(36).substring(2, 9);
                player.tools.push({
                    id: toolId,
                    type: item,
                    durability: templates[item].durability,
                    maxDurability: templates[item].durability
                });
            }
            embed.setTitle("🎁 Items Given")
                .setDescription(`Gave **${amount}x ${item.replace(/_/g, ' ')}** (Tools) to ${targetUser}.`);
        } else {
            player.inventory[item] = (player.inventory[item] || 0) + amount;
            embed.setTitle("🎁 Items Given")
                .setDescription(`Gave **${amount}x ${item.replace(/_/g, ' ')}** to ${targetUser}.`);
        }

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
