const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const uptimePath = path.join(dataDir, 'uptime.jsonl');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}

let heartbeats = {};

const START_2026_MS = new Date('2026-01-01T00:00:00+07:00').getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Load existing data (Grouped JSONL)
if (fs.existsSync(uptimePath)) {
	try {
		const content = fs.readFileSync(uptimePath, 'utf8');
		const lines = content.split('\n').filter(line => line.trim());
		lines.forEach(line => {
			const data = JSON.parse(line);
			for (const day in data) {
				if (!heartbeats[day]) heartbeats[day] = [];
				// Combine and sort ticks
				heartbeats[day] = [...new Set([...heartbeats[day], ...data[day]])].sort((a, b) => a - b);
			}
		});
	} catch (error) {
		console.error('Error loading uptime data, resetting:', error);
		heartbeats = {};
	}
}

const save = () => {
	try {
		// Format: one JSON object per day (one line per day)
		const lines = Object.keys(heartbeats).sort((a, b) => parseInt(a) - parseInt(b)).map(day => {
			return JSON.stringify({ [day]: heartbeats[day] });
		});
		fs.writeFileSync(uptimePath, lines.join('\n') + '\n', 'utf8');
	} catch (error) {
		console.error('Error saving uptime data:', error);
	}
};

const startTracking = () => {
	// Log a heartbeat every 30 seconds to ensure no minute is missed
	setInterval(() => {
		const now = Date.now();
		const diff = now - START_2026_MS;
		const dayNum = Math.floor(diff / MS_PER_DAY) + 1;
		
		// Adjust to Bangkok time (+7h) for hours/minutes calculation
		const bangkokTime = new Date(now + (7 * 60 * 60 * 1000));
		const currentHour = bangkokTime.getUTCHours();
		const currentMin = bangkokTime.getUTCMinutes();
		const tick = (currentHour * 60) + currentMin;

		if (!heartbeats[dayNum]) {
			heartbeats[dayNum] = [];
		}
		
		if (!heartbeats[dayNum].includes(tick)) {
			heartbeats[dayNum].push(tick);
			heartbeats[dayNum].sort((a, b) => a - b);
			save();
		}
	}, 30 * 1000); // 30 seconds
};

const getHeartbeats = () => {
	// Return a copy to prevent mutation
	return JSON.parse(JSON.stringify(heartbeats));
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
		
		// 2. Constants for calculating windows
		const now = Date.now();
		const allHeartbeats = getHeartbeats();
		
		const diff = now - START_2026_MS;
		const currentDayNum = Math.floor(diff / MS_PER_DAY) + 1;
		const bangkokTime = new Date(now + (7 * 60 * 60 * 1000));
		const currentHour = bangkokTime.getUTCHours();
		const currentMin = bangkokTime.getUTCMinutes();
		const currentTick = (currentHour * 60) + currentMin;

		const GRACE_PERIOD = 3;
		const currentTotalTicks = (currentDayNum - 1) * 1440 + currentTick;
		const maxExpectedTotal = currentTotalTicks - GRACE_PERIOD;

		// --- 24-HOUR BLOCKS ---
		const hourlyBlocks = [];
		for (let i = 23; i >= 0; i--) {
			// Calculate target hour in UTC+7
			let targetHour = currentHour - i;
			let targetDay = currentDayNum;
			while (targetHour < 0) {
				targetHour += 24;
				targetDay -= 1;
			}
			
			// Stay within 2026 limit
			if (targetDay < 1) {
				hourlyBlocks.push('⬛');
				continue;
			}

			const dayTicks = allHeartbeats[targetDay] || [];
			const hourTicks = dayTicks.filter(t => t >= targetHour * 60 && t < (targetHour + 1) * 60);
			const count = hourTicks.length;

			const targetStartTick = targetHour * 60;
			const targetEndTick = targetStartTick + 59;
			const targetTotalStart = (targetDay - 1) * 1440 + targetStartTick;
			const targetTotalEnd = (targetDay - 1) * 1440 + targetEndTick;
			
			let possible = 60;
			if (maxExpectedTotal >= targetTotalEnd) {
				possible = 60;
			} else if (maxExpectedTotal >= targetTotalStart) {
				possible = maxExpectedTotal - targetTotalStart + 1;
			} else {
				possible = 0;
			}

			if (possible > 0) {
				if (count >= possible) hourlyBlocks.push('🟩');
				else if (possible - count <= 5 && possible > 5) hourlyBlocks.push('🟨');
				else if (count > 0) hourlyBlocks.push('🟥');
				else hourlyBlocks.push('⬛');
			} else {
				if (count > 0) hourlyBlocks.push('🟩');
				else hourlyBlocks.push('⬛');
			}
		}

		// --- 24-DAY BLOCKS ---
		const dailyBlocks = [];
		for (let i = 23; i >= 0; i--) {
			const targetDay = currentDayNum - i;
			if (targetDay < 1) {
				dailyBlocks.push('⬛');
				continue;
			}

			const dayTicks = allHeartbeats[targetDay] || [];
			const count = dayTicks.length;
			
			const targetTotalStart = (targetDay - 1) * 1440;
			const targetTotalEnd = (targetDay - 1) * 1440 + 1439;
			
			let possible = 1440;
			if (maxExpectedTotal >= targetTotalEnd) {
				possible = 1440;
			} else if (maxExpectedTotal >= targetTotalStart) {
				possible = maxExpectedTotal - targetTotalStart + 1;
			} else {
				possible = 0;
			}

			if (possible > 0) {
				const percent = (count / possible) * 100;
				if (percent >= 100) dailyBlocks.push('🟩');
				else if (percent >= 95) dailyBlocks.push('🟨');
				else if (count > 0) dailyBlocks.push('🟥');
				else dailyBlocks.push('⬛');
			} else {
				if (count > 0) dailyBlocks.push('🟩');
				else dailyBlocks.push('⬛');
			}
		}

		// --- OUTAGE DETECTION (Past 24 Days) ---
		const outages = [];
		let inOutage = false;
		let outageStart = null;

		// We check from Max(1, currentDayNum - 23) up to now
		const startDayCheck = Math.max(1, currentDayNum - 23);
		
		for (let d = startDayCheck; d <= currentDayNum; d++) {
			const dayTicks = new Set(allHeartbeats[d] || []);
			const GRACE_PERIOD = 3;
			const maxTick = (d === currentDayNum) ? currentTick - GRACE_PERIOD : 1439;
			
			for (let t = 0; t <= maxTick; t++) {
				const present = dayTicks.has(t);
				if (!present && !inOutage) {
					// Outage started
					inOutage = true;
					outageStart = START_2026_MS + ((d - 1) * MS_PER_DAY) + (t * 60 * 1000);
				} else if (present && inOutage) {
					// Outage ended
					const outageEndTs = START_2026_MS + ((d - 1) * MS_PER_DAY) + (t * 60 * 1000) - 60000;
					outages.push({ start: outageStart, end: outageEndTs });
					inOutage = false;
				}
			}
		}
		// If still in outage at the very end
		if (inOutage) {
			const finalTs = START_2026_MS + ((currentDayNum - 1) * MS_PER_DAY) + (currentTick * 60 * 1000);
			outages.push({ start: outageStart, end: finalTs });
		}

		// Get last 5 outages, formatted
		const last5Outages = outages.slice(-5).reverse();
		const outageLines = last5Outages.map(o => {
			const durationMin = Math.round((o.end - o.start) / 60000) + 1;
			const startUnix = Math.floor(o.start / 1000);
			const endUnix = Math.floor(o.end / 1000);
			return `<t:${startUnix}:f> - offline for ${durationMin} min(s) from <t:${startUnix}:t> to <t:${endUnix}:t>`;
		});

		const embed = new EmbedBuilder()
			.setTitle('📊 System Status')
			.setColor(0x00FF00)
			.addFields(
				{ 
					name: '⏱️ Current Uptime', 
					value: `\`${formatDuration(currentUptime)}\``, 
					inline: false 
				},
				{ 
					name: '📈 Last 24 Hours', 
					value: `${hourlyBlocks.join('')}\n*Hourly reliability checks.*`, 
					inline: false 
				},
				{ 
					name: '📅 Last 24 Days', 
					value: `${dailyBlocks.join('')}\n*Daily reliability checks.*`, 
					inline: false 
				},
				{ 
					name: '⚠️ Recent Outages (Past 24 Days)', 
					value: outageLines.join('\n') || '✅ No outages detected.', 
					inline: false 
				}
			)
			.setFooter({ text: 'Reliability is based on minutely heartbeats.' })
			.setTimestamp();

		await interaction.reply({ embeds: [embed] });
	},
};