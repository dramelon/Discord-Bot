const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('enchant')
            .setDescription('Enchant user\'s equipped tool')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addStringOption(opt => opt.setName('enchantment').setDescription('Enchantment ID').setAutocomplete(true).setRequired(true))
            .addIntegerOption(opt => opt.setName('level').setDescription('Level').setMinValue(1).setMaxValue(5).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const encId = interaction.options.getString('enchantment');
        const level = interaction.options.getInteger('level');
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];
        const toolId = player.equipped.pickaxe;

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        if (!toolId) {
            return await interaction.reply({ content: "❌ User doesn't have a tool equipped.", ephemeral: true });
        }

        const tool = player.tools.find(t => t.id === toolId);
        if (!tool) return await interaction.reply({ content: "❌ Equipped tool not found.", ephemeral: true });

        if (!tool.enchantments) tool.enchantments = {};
        tool.enchantments[encId] = level;

        embed.setTitle("✨ Admin Enchant")
            .setDescription(`Enchanted ${targetUser}'s **${tool.type}** with **${encId} ${level}**.`);

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
