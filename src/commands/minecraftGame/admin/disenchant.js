const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../../utils/minecraftData');

module.exports = {
    data: (subcommand) =>
        subcommand
            .setName('disenchant')
            .setDescription('Disenchant user\'s equipped tool')
            .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
            .addStringOption(opt => opt.setName('enchantment').setDescription('Enchantment ID or "all"').setAutocomplete(true).setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;
        const encId = interaction.options.getString('enchantment');
        
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];
        const toolId = player.equipped.pickaxe;

        const embed = new EmbedBuilder().setColor(0xe74c3c);

        if (!toolId) {
            return await interaction.reply({ content: "❌ User doesn't have a tool equipped.", ephemeral: true });
        }

        const tool = player.tools.find(t => t.id === toolId);
        if (!tool) return await interaction.reply({ content: "❌ Equipped tool not found.", ephemeral: true });

        if (encId === 'all') {
            delete tool.enchantments;
            embed.setTitle("🕯️ Admin Disenchant")
                .setDescription(`Cleared ALL enchantments from ${targetUser}'s tool.`);
        } else if (tool.enchantments && tool.enchantments[encId]) {
            delete tool.enchantments[encId];
            embed.setTitle("🕯️ Admin Disenchant")
                .setDescription(`Removed **${encId}** from ${targetUser}'s tool.`);
        } else {
            return await interaction.reply({ content: "❌ That enchantment isn't on the tool.", ephemeral: true });
        }

        savePlayerData(allPlayerData);
        await interaction.reply({ embeds: [embed] });
    }
};
