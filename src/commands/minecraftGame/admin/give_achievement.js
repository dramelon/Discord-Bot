const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, getAdvancementData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('give_achievement')
            .setDescription('Grant an achievement to a user')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addStringOption(opt => opt.setName('achievement').setDescription('Advancement ID').setAutocomplete(true).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const advId = interaction.options.getString('achievement');
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];
        const advancements = getAdvancementData();

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        if (!advancements[advId]) {
            return await interaction.reply({ content: "❌ Invalid advancement ID.", ephemeral: true });
        }

        if (!player.advancements.includes(advId)) {
            player.advancements.push(advId);
            advancements[advId].unlocks.forEach(r => {
                if (!player.unlocked_recipes.includes(r)) {
                    player.unlocked_recipes.push(r);
                }
            });
            embed.setTitle("🏆 Achievement Granted")
                .setDescription(`Granted **${advancements[advId].name}** to ${targetUser}. Recipes unlocked!`);
        } else {
            return await interaction.reply({ content: "❌ User already has this achievement.", ephemeral: true });
        }

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
