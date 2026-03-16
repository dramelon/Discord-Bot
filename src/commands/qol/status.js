const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const uptimePath = path.join(dataDir, 'uptime.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}

let heartbeats = [];

// Load existing data
if (fs.existsSync(uptimePath)) {
	try {
		heartbeats = JSON.parse(fs.readFileSync(uptimePath, 'utf8'));
	} catch (error) {
		console.error('Error loading uptime data, resetting:', error);
		heartbeats = [];
	}
}

const save = () => {
	try {
		fs.writeFileSync(uptimePath, JSON.stringify(heartbeats), 'utf8');
	} catch (error) {
		console.error('Error saving uptime data:', error);
	}
};

const startTracking = () => {
	// Log a heartbeat every minute
	setInterval(() => {
		const now = Date.now();
		heartbeats.push(now);

		// Keep only last 32 days of data (buffer for 30d calc)
		const cutoff = now - (32 * 24 * 60 * 60 * 1000);
		if (heartbeats.length > 0 && heartbeats[0] < cutoff) {
			const splitIndex = heartbeats.findIndex(t => t >= cutoff);
			if (splitIndex > 0) {
				heartbeats = heartbeats.slice(splitIndex);
			}
		}

		save();
	}, 60 * 1000); // 60 seconds
};

const getHeartbeats = () => {
	// Return a copy to prevent mutation
	return [...heartbeats];
};

function formatDuration(seconds) {
	const d = Math.floor(seconds / (3600 * 24));
	const h = Math.floor((seconds % (3600 * 24)) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	const parts = [];
	if (d > 0) parts.push(`${d}d`);
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0) parts.push(`${s}s`);
	
	return parts.join(' ') || '0s';
}

function createProgressBar(percent) {
	const totalBars = 10;
	const filledBars = Math.round((percent / 100) * totalBars);
	const emptyBars = totalBars - filledBars;
	
	const filledChar = '🟩';
	const emptyChar = '⬛';
	
	return `${filledChar.repeat(filledBars)}${emptyChar.repeat(emptyBars)}`;
}

module.exports = {
	startTracking,
	data: new SlashCommandBuilder()
		.setName('status')
		.setDescription('Show bot uptime and reliability stats.')
		.setContexts([0, 1, 2])
		.setIntegrationTypes([0, 1]),
	async execute(interaction) {
		// 1. Current Session Uptime
		const currentUptime = process.uptime();
		
		// 2. Historical Uptime Calculation
		const now = Date.now();
		const heartbeats = getHeartbeats();
		
		// 24 Hours (1440 minutes)
		const oneDayAgo = now - (24 * 60 * 60 * 1000);
		const heartbeats24h = heartbeats.filter(t => t >= oneDayAgo).length;
		// Cap at 100% (1440 minutes)
		const percent24h = Math.min(100, (heartbeats24h / 1440) * 100);

		// 30 Days (43200 minutes)
		const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
		const heartbeats30d = heartbeats.filter(t => t >= thirtyDaysAgo).length;
		const percent30d = Math.min(100, (heartbeats30d / 43200) * 100);

		const embed = new EmbedBuilder()
			.setTitle('📊 System Status')
			.setColor(0x00FF00)
			.setThumbnail(interaction.client.user.displayAvatarURL())
			.addFields(
				{ 
					name: '⏱️ Current Uptime', 
					value: `\`${formatDuration(currentUptime)}\``, 
					inline: false 
				},
				{ 
					name: '📈 24-Hour Reliability', 
					value: `${createProgressBar(percent24h)} **${percent24h.toFixed(1)}%**`, 
					inline: false 
				},
				{ 
					name: '📅 30-Day Reliability', 
					value: `${createProgressBar(percent30d)} **${percent30d.toFixed(1)}%**`, 
					inline: false 
				}
			)
			.setFooter({ text: 'Reliability is based on minutely heartbeats.' });

		await interaction.reply({ embeds: [embed] });
	},
};