const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(process.cwd(), 'data', 'levels.json');
const xpRequirePath = path.join(process.cwd(), 'data', 'level_xprequire.json');

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
		
		let data = {};
		if (fs.existsSync(dataPath)) {
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				console.error('Error reading levels data:', e);
			}
		}

		const userData = data[target.id] || { xp: 0, level: 0 };
		
		let xpRequirements = {};
		if (fs.existsSync(xpRequirePath)) {
			try {
				xpRequirements = JSON.parse(fs.readFileSync(xpRequirePath, 'utf8'));
			} catch (e) { console.error(e); }
		}

		const nextLevelXp = xpRequirements[userData.level + 1] || 'Max';

		const embed = new EmbedBuilder()
			.setTitle(`${target.username}'s Rank`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x00FF00)
			.addFields(
				{ name: 'Level', value: `${userData.level}`, inline: true },
				{ name: 'XP', value: `${userData.xp} / ${nextLevelXp}`, inline: true }
			);

		await interaction.reply({ embeds: [embed] });
	},
};