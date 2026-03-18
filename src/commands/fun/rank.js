const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserLevelData, getXPRequired } = require('../../leveling');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rank')
		.setDescription('Check your current level and XP')
		.setContexts([0])
		.setIntegrationTypes([0])
		.addUserOption(option => 
			option.setName('target')
				.setDescription('The user to check (defaults to you)')
				.setRequired(false)),
	async execute(interaction) {
		const target = interaction.options.getUser('target') || interaction.user;
		const userData = getUserLevelData(target.id);
		
		const nextLevel = userData.level + 1;
		const requiredXP = getXPRequired(nextLevel);
		const progress = Math.min(100, Math.floor((userData.xp / requiredXP) * 100));

		const embed = new EmbedBuilder()
			.setTitle(`${target.username}'s Rank`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x00FF00)
			.addFields(
				{ name: 'Level', value: `⭐ ${userData.level}`, inline: true },
				{ name: 'Progress', value: `📊 ${userData.xp} / ${requiredXP} (${progress}%)`, inline: true },
				{ name: 'Total XP', value: `✨ ${userData.totalXp}`, inline: true },
				{ name: 'Messages', value: `💬 ${userData.totalMessages || 0}`, inline: true }
			)
			.setFooter({ text: 'Keep chatting and playing Minecraft to level up!' });

		await interaction.reply({ embeds: [embed] });
	},
};