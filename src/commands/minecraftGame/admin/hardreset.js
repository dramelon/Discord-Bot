const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('hardreset')
            .setDescription('Reset a user to level 0 and empty inventory')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        player.inventory = {};
        player.tools = [];
        player.equipped = { pickaxe: null };
        player.furnaces = [];
        player.stats = {
            trees_chopped: 0,
            blocks_mined: 0
        };
        player.unlocked_recipes = [];
        player.advancements = [];
        
        embed.setTitle("♻️ Hard Reset")
            .setDescription(`Wiped inventory, tools, and stats for ${targetUser}. **Level and XP preserved.**`);

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
