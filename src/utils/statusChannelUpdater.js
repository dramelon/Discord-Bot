const os = require('os');

// Channel IDs to track status
const CHANNELS = {
	onlineTime: '1519543791965569164',
	uptime: '1519544093313728663',
	servers: '1519544260041510962',
	installs: '1519544323845263471',
	environment: '1519544898674491502'
};

// State trackers for rate-limiting and timing
let last10MinUpdateTs = 0;
const updateHistory = {
	[CHANNELS.servers]: [],
	[CHANNELS.installs]: [],
	[CHANNELS.environment]: []
};

/**
 * Formats seconds into human-readable duration (e.g. 2d 5h 12m)
 * @param {number} seconds 
 * @returns {string}
 */
function formatDuration(seconds) {
	const d = Math.floor(seconds / (3600 * 24));
	const h = Math.floor((seconds % (3600 * 24)) / 3600);
	const m = Math.floor((seconds % 3600) / 60);

	const parts = [];
	if (d > 0) parts.push(`${d}d`);
	if (h > 0) parts.push(`${h}h`);
	parts.push(`${m}m`); // always show minutes
	
	return parts.join(' ');
}

/**
 * Updates channel name with rate-limiting check
 * @param {import('discord.js').Client} client 
 * @param {string} channelId 
 * @param {string} targetName 
 */
async function tryUpdateChannelName(client, channelId, targetName) {
	try {
		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!channel) return;

		// If the name is already correct, do nothing
		if (channel.name === targetName) {
			return;
		}

		const now = Date.now();
		
		// Filter history to keep only timestamps in the last 10 minutes
		updateHistory[channelId] = (updateHistory[channelId] || []).filter(ts => now - ts < 10 * 60 * 1000);
		
		// Check rate limit: maximum 2 updates per 10 minutes
		if (updateHistory[channelId].length >= 2) {
			return;
		}

		await channel.setName(targetName);
		updateHistory[channelId].push(now);
	} catch (error) {
		console.error(`[StatusUpdater] Error updating channel ${channelId}:`, error);
	}
}

/**
 * Force updates channel name (for 10-minute scheduled channels)
 * @param {import('discord.js').Client} client 
 * @param {string} channelId 
 * @param {string} targetName 
 */
async function updateChannelNameForced(client, channelId, targetName) {
	try {
		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!channel) return;

		if (channel.name !== targetName) {
			await channel.setName(targetName);
		}
	} catch (error) {
		console.error(`[StatusUpdater] Error updating channel ${channelId} (forced):`, error);
	}
}

/**
 * Main update function that runs minutely
 * @param {import('discord.js').Client} client 
 */
async function checkAndUpdateChannels(client) {
	const now = Date.now();

	// 1. Fetch current metrics
	const application = await client.application?.fetch().catch(() => null);
	const installCount = application ? (application.approximateUserInstallCount || 0) : 0;
	const serverCount = client.guilds.cache.size;

	// Environment detection (safely wrapped try-catch to prevent ENOENT crash in containers)
	let isLocal = false;
	try {
		isLocal = process.platform === 'darwin' || os.userInfo().username === 'newdramelon' || process.cwd().includes('newdramelon');
	} catch (e) {
		isLocal = process.platform === 'darwin' || process.cwd().includes('newdramelon');
	}
	const envStr = isLocal ? 'Local PC' : 'VPS Server';

	// 2. Prepare target names for minutely channels
	const names = {
		servers: `🖥️ Servers: ${serverCount}`,
		installs: `👤 Installs: ${installCount}`,
		environment: `💻 Env: ${envStr}`
	};

	// 3. Update minutely channels if changed & not rate-limited
	const minutelyKeys = ['servers', 'installs', 'environment'];
	for (const key of minutelyKeys) {
		const channelId = CHANNELS[key];
		const targetName = names[key];
		await tryUpdateChannelName(client, channelId, targetName);
	}

	// 4. Update 10-minute channels (onlineTime, uptime)
	if (now - last10MinUpdateTs >= 10 * 60 * 1000) {
		// Calculate UTC+7 online time
		const bangkokTime = new Date(now + (7 * 60 * 60 * 1000));
		const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
		const minutes = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
		const day = String(bangkokTime.getUTCDate()).padStart(2, '0');
		const month = String(bangkokTime.getUTCMonth() + 1).padStart(2, '0');
		const onlineTimeName = `🟢 Online: ${day}/${month} ${hours}:${minutes}`;

		// Calculate uptime name
		const uptimeSeconds = process.uptime();
		const uptimeName = `⏳ Uptime: ${formatDuration(uptimeSeconds)}`;

		// Update 10-min channels
		await updateChannelNameForced(client, CHANNELS.onlineTime, onlineTimeName);
		await updateChannelNameForced(client, CHANNELS.uptime, uptimeName);

		last10MinUpdateTs = now;
	}
}

/**
 * Starts the status channel updater cycle
 * @param {import('discord.js').Client} client 
 */
function startStatusChannelUpdater(client) {
	// Initial update on startup
	checkAndUpdateChannels(client).catch(err => {
		console.error('[StatusUpdater] Initial status check failed:', err);
	});

	// Run checks every minute (60 * 1000 ms)
	setInterval(() => {
		checkAndUpdateChannels(client).catch(err => {
			console.error('[StatusUpdater] Periodic status check failed:', err);
		});
	}, 60 * 1000);
}

module.exports = {
	startStatusChannelUpdater
};
