const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(process.cwd(), 'data', 'levels.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('Show the top 10 users by total XP')
		.setContexts([0])
		.setIntegrationTypes([0, 1]),
	async execute(interaction) {
		let data = {};
		if (fs.existsSync(dataPath)) {
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				console.error('Error reading levels data:', e);
			}
		}

		// Convert data object to array, sort by totalXp descending, and take top 10
		const topUsers = Object.entries(data)
			.map(([userId, userData]) => ({ userId, ...userData }))
			.sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0))
			.slice(0, 10);

		if (topUsers.length === 0) {
			return interaction.reply({ content: 'No leaderboard data found yet.', ephemeral: true });
		}

		const embed = new EmbedBuilder()
			.setTitle('🏆 Universal Leaderboard')
			.setColor(0xFFD700) // Gold
			.setDescription(topUsers.map((user, index) => {
				const rank = index + 1;
				const displayName = user.displayname || user.username || `User ${user.userId}`;
				return `**${rank}.** **${displayName}** (<@${user.userId}>)\n╰ Level **${user.level}** • **${user.totalXp}** Total XP • **${user.totalMessages || 0}** Messages`;
			}).join('\n\n'));

		await interaction.reply({ embeds: [embed] });
	},
};