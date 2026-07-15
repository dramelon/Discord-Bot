const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');
const apiTracker = require('../utils/apiTracker');

// Safe environment detection to avoid ENOENT crash inside Docker containers (Pterodactyl, etc.)
let isLocal = false;
try {
	isLocal = process.platform === 'darwin' || os.userInfo().username === 'newdramelon' || process.cwd().includes('newdramelon');
} catch (e) {
	isLocal = process.platform === 'darwin' || process.cwd().includes('newdramelon');
}

// Try importing heartbeats helper from status command
let getHeartbeats = null;
try {
	const statusModule = require('../commands/qol/status');
	if (statusModule && statusModule.getHeartbeats) {
		getHeartbeats = statusModule.getHeartbeats;
	}
} catch (err) {
	console.error('[Dashboard] Could not import status command module:', err);
}

// Uptime calculation constants matching status.js
const START_2026_MS = new Date('2026-01-01T00:00:00+07:00').getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Read and cache HTML files in memory on startup
const HTML_FILE_PATH = path.join(__dirname, 'index.html');
const HOME_FILE_PATH = path.join(__dirname, 'home.html');
const MY_SERVER_FILE_PATH = path.join(__dirname, 'my_server.html');
const MY_CONFIG_FILE_PATH = path.join(__dirname, 'my_config.html');
const LOG_VIEWER_FILE_PATH = path.join(__dirname, 'log_viewer.html');
const ADMIN_PANEL_FILE_PATH = path.join(__dirname, 'admin_panel.html');
const ADMIN_API_LOGS_FILE_PATH = path.join(__dirname, 'admin_api_logs.html');
const SIDEBAR_FILE_PATH = path.join(__dirname, 'sidebar.html');
let cachedHtml = '';
let cachedHomeHtml = '';
let cachedMyServerHtml = '';
let cachedMyConfigHtml = '';
let cachedLogViewerHtml = '';
let cachedAdminPanelHtml = '';
let cachedAdminApiLogsHtml = '';
let cachedSidebarHtml = '';

try {
	cachedSidebarHtml = fs.readFileSync(SIDEBAR_FILE_PATH, 'utf8');
} catch (err) {
	console.error('[Dashboard] Error reading sidebar.html:', err);
}

try {
	cachedHtml = fs.readFileSync(HTML_FILE_PATH, 'utf8').replace('<!-- INCLUDE_SIDEBAR -->', cachedSidebarHtml);
} catch (err) {
	console.error('[Dashboard] Error reading index.html:', err);
	cachedHtml = '<h1>Dashboard Template Error</h1>';
}

try {
	cachedHomeHtml = fs.readFileSync(HOME_FILE_PATH, 'utf8');
} catch (err) {
	console.error('[Dashboard] Error reading home.html:', err);
	cachedHomeHtml = '<h1>Home Template Error</h1>';
}

try {
	cachedMyServerHtml = fs.readFileSync(MY_SERVER_FILE_PATH, 'utf8').replace('<!-- INCLUDE_SIDEBAR -->', cachedSidebarHtml);
} catch (err) {
	console.error('[Dashboard] Error reading my_server.html:', err);
	cachedMyServerHtml = '<h1>My Servers Template Error</h1>';
}

try {
	cachedMyConfigHtml = fs.readFileSync(MY_CONFIG_FILE_PATH, 'utf8').replace('<!-- INCLUDE_SIDEBAR -->', cachedSidebarHtml);
} catch (err) {
	console.error('[Dashboard] Error reading my_config.html:', err);
	cachedMyConfigHtml = '<h1>My Configuration Template Error</h1>';
}

try {
	cachedLogViewerHtml = fs.readFileSync(LOG_VIEWER_FILE_PATH, 'utf8').replace('<!-- INCLUDE_SIDEBAR -->', cachedSidebarHtml);
} catch (err) {
	console.error('[Dashboard] Error reading log_viewer.html:', err);
	cachedLogViewerHtml = '<h1>Log Viewer Template Error</h1>';
}

try {
	cachedAdminPanelHtml = fs.readFileSync(ADMIN_PANEL_FILE_PATH, 'utf8').replace('<!-- INCLUDE_SIDEBAR -->', cachedSidebarHtml);
} catch (err) {
	console.error('[Dashboard] Error reading admin_panel.html:', err);
	cachedAdminPanelHtml = '<h1>Admin Panel Template Error</h1>';
}

try {
	cachedAdminApiLogsHtml = fs.readFileSync(ADMIN_API_LOGS_FILE_PATH, 'utf8').replace('<!-- INCLUDE_SIDEBAR -->', cachedSidebarHtml);
} catch (err) {
	console.error('[Dashboard] Error reading admin_api_logs.html:', err);
	cachedAdminApiLogsHtml = '<h1>Admin API Logs Template Error</h1>';
}

// In-memory rate limiting map
const rateLimitMap = new Map();
const LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 40; // 40 requests per minute

/**
 * Basic IP rate limiter
 * @param {string} ip 
 * @returns {boolean}
 */
function isRateLimited(ip) {
	const now = Date.now();
	if (!rateLimitMap.has(ip)) {
		rateLimitMap.set(ip, { count: 1, resetTime: now + LIMIT_WINDOW_MS });
		return false;
	}

	const record = rateLimitMap.get(ip);
	if (now > record.resetTime) {
		record.count = 1;
		record.resetTime = now + LIMIT_WINDOW_MS;
		return false;
	}

	record.count++;
	return record.count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Periodically cleanup rate limit map to prevent leak
 */
setInterval(() => {
	const now = Date.now();
	for (const [ip, record] of rateLimitMap.entries()) {
		if (now > record.resetTime) {
			rateLimitMap.delete(ip);
		}
	}
}, 5 * 60 * 1000); // every 5 minutes

/**
 * Format uptime into readable string
 * @param {number} seconds 
 */
function formatDuration(seconds) {
	const d = Math.floor(seconds / (3600 * 24));
	const h = Math.floor((seconds % (3600 * 24)) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	const parts = [];
	if (d > 0) parts.push(`${d}d`);
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	parts.push(`${s}s`);

	return parts.join(' ');
}

/**
 * Calculates blocks status for the API response
 */
function calculateReliability() {
	const now = Date.now();
	const allHeartbeats = getHeartbeats ? getHeartbeats() : {};

	const diff = now - START_2026_MS;
	const currentDayNum = Math.floor(diff / MS_PER_DAY) + 1;

	// Adjust to Bangkok time (+7h) for ticks calculations
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
		let targetHour = currentHour - i;
		let targetDay = currentDayNum;
		while (targetHour < 0) {
			targetHour += 24;
			targetDay -= 1;
		}

		if (targetDay < 1) {
			hourlyBlocks.push({ status: 'no-data', info: 'Not tracked yet' });
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
			if (count >= possible) {
				hourlyBlocks.push({ status: 'active', info: `${count}/${possible} ticks` });
			} else if (possible - count <= 5 && possible > 5) {
				hourlyBlocks.push({ status: 'degraded', info: `${count}/${possible} ticks` });
			} else if (count > 0) {
				hourlyBlocks.push({ status: 'down', info: `${count}/${possible} ticks` });
			} else {
				hourlyBlocks.push({ status: 'down', info: `0/${possible} ticks` });
			}
		} else {
			if (count > 0) {
				hourlyBlocks.push({ status: 'active', info: `${count} ticks` });
			} else {
				hourlyBlocks.push({ status: 'no-data', info: 'No data recorded' });
			}
		}
	}

	// --- 24-DAY BLOCKS ---
	const dailyBlocks = [];
	for (let i = 23; i >= 0; i--) {
		const targetDay = currentDayNum - i;
		if (targetDay < 1) {
			dailyBlocks.push({ status: 'no-data', info: 'Not tracked yet' });
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
			const percent = Math.round((count / possible) * 100 * 10) / 10;
			if (percent >= 100) {
				dailyBlocks.push({ status: 'active', info: `${percent}% uptime (${count}/${possible} mins)` });
			} else if (percent >= 95) {
				dailyBlocks.push({ status: 'degraded', info: `${percent}% uptime (${count}/${possible} mins)` });
			} else if (count > 0) {
				dailyBlocks.push({ status: 'down', info: `${percent}% uptime (${count}/${possible} mins)` });
			} else {
				dailyBlocks.push({ status: 'down', info: `0% uptime (0/${possible} mins)` });
			}
		} else {
			if (count > 0) {
				dailyBlocks.push({ status: 'active', info: 'Active today' });
			} else {
				dailyBlocks.push({ status: 'no-data', info: 'No data recorded' });
			}
		}
	}

	// --- OUTAGES (Past 24 Days) ---
	const outages = [];
	let inOutage = false;
	let outageStart = null;
	const startDayCheck = Math.max(1, currentDayNum - 23);

	for (let d = startDayCheck; d <= currentDayNum; d++) {
		const dayTicks = new Set(allHeartbeats[d] || []);
		const maxTick = (d === currentDayNum) ? currentTick - GRACE_PERIOD : 1439;

		for (let t = 0; t <= maxTick; t++) {
			const present = dayTicks.has(t);
			if (!present && !inOutage) {
				inOutage = true;
				outageStart = START_2026_MS + ((d - 1) * MS_PER_DAY) + (t * 60 * 1000);
			} else if (present && inOutage) {
				const outageEndTs = START_2026_MS + ((d - 1) * MS_PER_DAY) + (t * 60 * 1000) - 60000;
				outages.push({
					start: outageStart,
					end: outageEndTs,
					durationMin: Math.round((outageEndTs - outageStart) / 60000) + 1
				});
				inOutage = false;
			}
		}
	}
	if (inOutage) {
		const finalTs = START_2026_MS + ((currentDayNum - 1) * MS_PER_DAY) + (currentTick * 60 * 1000);
		outages.push({
			start: outageStart,
			end: finalTs,
			durationMin: Math.round((finalTs - outageStart) / 60000) + 1
		});
	}

	const last5Outages = outages.slice(-5).reverse();
	return { hourlyBlocks, dailyBlocks, outages: last5Outages };
}

const SESSIONS_FILE_PATH = path.join(process.cwd(), 'data', 'sessions.json');
const USER_CONFIGS_FILE_PATH = path.join(process.cwd(), 'data', 'userConfigs.json');
let sessions = {};
let userConfigs = {};

// Load sessions from file on startup
function loadSessions() {
	try {
		if (fs.existsSync(SESSIONS_FILE_PATH)) {
			const data = fs.readFileSync(SESSIONS_FILE_PATH, 'utf8');
			sessions = JSON.parse(data);
		} else {
			sessions = {};
		}
	} catch (err) {
		console.error('[Dashboard] Error loading sessions.json:', err);
		sessions = {};
	}
}

// Save sessions to file
function saveSessions() {
	try {
		const dir = path.dirname(SESSIONS_FILE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(SESSIONS_FILE_PATH, JSON.stringify(sessions, null, 2), 'utf8');
	} catch (err) {
		console.error('[Dashboard] Error saving sessions.json:', err);
	}
}

// Load user configs on startup
function loadUserConfigs() {
	try {
		if (fs.existsSync(USER_CONFIGS_FILE_PATH)) {
			const data = fs.readFileSync(USER_CONFIGS_FILE_PATH, 'utf8');
			userConfigs = JSON.parse(data);
		} else {
			userConfigs = {};
		}
	} catch (err) {
		console.error('[Dashboard] Error loading userConfigs.json:', err);
		userConfigs = {};
	}
}

// Save user configs to file
function saveUserConfigs() {
	try {
		const dir = path.dirname(USER_CONFIGS_FILE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(USER_CONFIGS_FILE_PATH, JSON.stringify(userConfigs, null, 2), 'utf8');
	} catch (err) {
		console.error('[Dashboard] Error saving userConfigs.json:', err);
	}
}

// Initial loads
loadSessions();
loadUserConfigs();

/**
 * Make an external HTTP request to Discord API
 */
async function makeDiscordRequest(method, urlPath, headers = {}, postData = null) {
	const url = `https://discord.com${urlPath}`;
	const options = {
		method: method,
		headers: {
			...headers,
			'User-Agent': 'DiscordBot (https://github.com/dramelon, 1.0.0)'
		}
	};

	if (postData) {
		options.body = postData;
		if (typeof postData === 'string') {
			options.headers['Content-Length'] = Buffer.byteLength(postData).toString();
		}
	}

	const res = await apiTracker.fetch(url, options);
	const bodyText = await res.text();
	let parsedBody = bodyText;

	const contentType = res.headers.get('content-type');
	if (contentType && contentType.includes('application/json')) {
		try {
			parsedBody = JSON.parse(bodyText);
		} catch (err) {
			// ignore and use bodyText
		}
	}

	if (res.status >= 200 && res.status < 300) {
		return parsedBody;
	} else {
		throw new Error(`Discord API error: ${res.status} - ${typeof parsedBody === 'object' ? JSON.stringify(parsedBody) : parsedBody}`);
	}
}

/**
 * Gets the number of unlocked Minecraft achievements for a user
 */
function getAchievementsCount(userId) {
	try {
		const MAP_FILE = path.join(process.cwd(), 'data', 'minecraft', 'username_map.json');
		const TRACKER_FILE = path.join(process.cwd(), 'data', 'minecraft', 'achievements_tracker.json');

		if (fs.existsSync(MAP_FILE) && fs.existsSync(TRACKER_FILE)) {
			const mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8') || '{}');
			const trackerData = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8') || '{"players":{}}');

			// Find Minecraft username matching this Discord ID
			const mcUsername = Object.keys(mapData).find(key => mapData[key] === userId);
			if (mcUsername && trackerData.players[mcUsername]) {
				return (trackerData.players[mcUsername].achievements || []).length;
			}
		}
	} catch (e) {
		console.error('[Dashboard] Error counting user achievements:', e);
	}
	return 0;
}

/**
 * Registers Application Connection Metadata fields with Discord API
 */
async function registerConnectionMetadata(client) {
	try {
		const CLIENT_ID = process.env.CLIENT_ID;
		const token = process.env.DISCORD_TOKEN;
		if (!CLIENT_ID || !token) {
			console.log('[Dashboard] CLIENT_ID or DISCORD_TOKEN is missing. Skipping connection metadata registration.');
			return;
		}

		console.log('[Dashboard] Registering Connection Metadata schema with Discord...');

		const metadataSchema = [
			{
				key: 'level',
				name: 'Bot Level',
				description: 'Your leveling level from Fluffingiously Dragooon',
				type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
			},
			{
				key: 'achievements',
				name: 'Achievements',
				description: 'Total server achievements unlocked',
				type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
			},
			{
				key: 'xp',
				name: 'Total XP',
				description: 'Total experience points earned',
				type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
			},
			{
				key: 'member_days',
				name: 'Loyalty Days',
				description: 'Days since joining the server',
				type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
			},
			{
				key: 'is_developer',
				name: 'Bot Developer',
				description: 'Verified bot developer status',
				type: 7 // BOOLEAN_EQUAL
			}
		];

		const resBody = await makeDiscordRequest(
			'PUT',
			`/api/v10/applications/${CLIENT_ID}/role-connections/metadata`,
			{
				'Authorization': `Bot ${token}`,
				'Content-Type': 'application/json'
			},
			JSON.stringify(metadataSchema)
		);

		console.log('[Dashboard] Connection Metadata schema registered successfully:', resBody);
	} catch (error) {
		console.error('[Dashboard] Error registering connection metadata schema:', error);
	}
}

/**
 * Syncs user statistics to Discord Role Connections for profile display
 */
async function syncDiscordConnection(userId, client, accessToken) {
	try {
		const CLIENT_ID = process.env.CLIENT_ID;
		if (!CLIENT_ID || !accessToken) return;

		// 1. Fetch user leveling data
		const { getUserLevelData, getXPRequired } = require('../leveling');
		const userData = getUserLevelData(userId) || { level: 0, totalXp: 0 };

		// 2. Fetch user achievements
		const achievementsCount = getAchievementsCount(userId);

		// 3. Fetch loyalty days
		let joinedDays = 0;
		const HOMETOWN_GUILD_ID = process.env.HOMETOWN_GUILD_ID || '1447192381479976993';
		const hometownGuild = client.guilds.cache.get(HOMETOWN_GUILD_ID);
		if (hometownGuild) {
			const hometownMember = await hometownGuild.members.fetch(userId).catch(() => null);
			if (hometownMember && hometownMember.joinedTimestamp) {
				joinedDays = Math.floor((Date.now() - hometownMember.joinedTimestamp) / (1000 * 60 * 60 * 24));
			}
		}

		// 4. Check developer status
		const botDevs = process.env.BOT_DEV ? process.env.BOT_DEV.split(',') : [];
		const isDeveloper = botDevs.includes(userId);

		// 5. Build metadata object based on user toggles
		const userConfig = userConfigs[userId] || {};
		const connConfig = userConfig.connectionsConfig || {
			syncLevel: true,
			syncXP: true,
			syncAchievements: true,
			syncMessages: true,
			syncEmojis: true,
			syncStickers: true
		};

		// Fetch user tag/username for platform_username
		const discordUser = await client.users.fetch(userId).catch(() => null);
		const platformUsername = discordUser ? discordUser.tag : 'User';

		let roleConnectionSuccess = false;
		let widgetSuccess = false;

		// Sync Standard Role Connections (requires Bearer token with role_connections.write scope)
		try {
			const metadata = {};
			if (connConfig.syncLevel !== false) metadata.level = String(userData.level || 0);
			if (connConfig.syncAchievements !== false) metadata.achievements = String(achievementsCount || 0);
			if (connConfig.syncXP !== false) metadata.xp = String(userData.totalXp || 0);
			if (connConfig.syncLoyalty !== false) metadata.member_days = String(joinedDays || 0);
			if (connConfig.syncDeveloper !== false) metadata.is_developer = String(isDeveloper ? 'true' : 'false');

			const payload = {
				platform_name: 'Fluffingiously Dragooon',
				platform_username: platformUsername,
				metadata: metadata
			};

			await makeDiscordRequest(
				'PUT',
				`/api/v10/users/@me/applications/${CLIENT_ID}/role-connection`,
				{
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				},
				JSON.stringify(payload)
			);
			console.log(`[Dashboard] Successfully synced standard role connection metadata for user ${userId}`);
			roleConnectionSuccess = true;
		} catch (error) {
			if (error.message && error.message.includes('401')) {
				console.warn(`[Dashboard] Standard Role Connection sync skipped/unauthorized for user ${userId} (requires role_connections.write scope)`);
			} else {
				console.error(`[Dashboard] Failed standard Role Connection sync for user ${userId}:`, error.message || error);
			}
		}

		// Sync Custom Profile Board Widget (requires bot token, updates identities/0/profile v9)
		try {
			const botToken = process.env.DISCORD_TOKEN;
			if (botToken) {
				let avatarUrl = '';
				if (discordUser) {
					if (discordUser.avatar) {
						avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png?size=256`;
					} else {
						avatarUrl = `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
					}
				}

				// A. Read levels.json for rankings
				const levelsFilePath = path.join(process.cwd(), 'data', 'levels.json');
				let levelsData = {};
				if (fs.existsSync(levelsFilePath)) {
					try {
						levelsData = JSON.parse(fs.readFileSync(levelsFilePath, 'utf8') || '{}');
					} catch (e) {
						console.error('[Dashboard] Error reading levels.json for rank calculations:', e);
					}
				}

				const levelEntries = Object.entries(levelsData).map(([id, u]) => ({
					userId: id,
					level: u.level || 0,
					totalXp: u.totalXp || 0,
					totalMessages: u.totalMessages !== undefined ? u.totalMessages : (u.totalXp || 0)
				}));

				// Rank 1: level rank
				const sortedByLevel = [...levelEntries].sort((a, b) => {
					if (b.level !== a.level) return b.level - a.level;
					return b.totalXp - a.totalXp;
				});
				const totalLevelUsers = sortedByLevel.length;
				const levelRank = sortedByLevel.findIndex(e => e.userId === userId) + 1;

				// Rank 4: messages rank
				const sortedByMessages = [...levelEntries].sort((a, b) => b.totalMessages - a.totalMessages);
				const totalMessageUsers = sortedByMessages.length;
				const messageRank = sortedByMessages.findIndex(e => e.userId === userId) + 1;
				const userMessages = levelsData[userId]?.totalMessages !== undefined ? levelsData[userId].totalMessages : (userData.totalXp || 0);

				// B. Read minecraft achievements files
				const mapFilePath = path.join(process.cwd(), 'data', 'minecraft', 'username_map.json');
				const trackerFilePath = path.join(process.cwd(), 'data', 'minecraft', 'achievements_tracker.json');
				const discoveredFilePath = path.join(process.cwd(), 'data', 'minecraft', 'discovered_achievements.json');

				let mapData = {};
				let trackerData = { players: {} };
				let discoveredData = {};

				if (fs.existsSync(mapFilePath)) {
					try { mapData = JSON.parse(fs.readFileSync(mapFilePath, 'utf8') || '{}'); } catch(e){}
				}
				if (fs.existsSync(trackerFilePath)) {
					try { trackerData = JSON.parse(fs.readFileSync(trackerFilePath, 'utf8') || '{"players":{}}'); } catch(e){}
				}
				if (fs.existsSync(discoveredFilePath)) {
					try { discoveredData = JSON.parse(fs.readFileSync(discoveredFilePath, 'utf8') || '{}'); } catch(e){}
				}

				const totalAchievements = Object.keys(discoveredData).length;

				// Compile achievement list for rank calculation
				const achievementRankings = [];
				Object.entries(mapData).forEach(([mcUsername, discordId]) => {
					if (trackerData.players[mcUsername]) {
						const count = (trackerData.players[mcUsername].achievements || []).length;
						if (count > 0) {
							achievementRankings.push({ userId: discordId, count });
						}
					}
				});
				achievementRankings.sort((a, b) => b.count - a.count);
				const totalAchievementUsers = achievementRankings.length;
				const achievementRank = achievementRankings.findIndex(e => e.userId === userId) + 1;

				// C. Read socialactivity.json for emojis and stickers
				const socialActivityPath = path.join(process.cwd(), 'data', 'socialactivity.json');
				let socialData = { emojiUsers: {}, stickerUsers: {} };
				if (fs.existsSync(socialActivityPath)) {
					try {
						socialData = JSON.parse(fs.readFileSync(socialActivityPath, 'utf8') || '{"emojiUsers":{},"stickerUsers":{}}');
					} catch (e) {}
				}
				if (!socialData.emojiUsers) socialData.emojiUsers = {};
				if (!socialData.stickerUsers) socialData.stickerUsers = {};

				// Emojis rank
				const emojiRankings = Object.entries(socialData.emojiUsers)
					.map(([id, count]) => ({ userId: id, count }))
					.filter(e => e.count > 0)
					.sort((a, b) => b.count - a.count);
				const totalEmojiUsers = emojiRankings.length;
				const userEmojiCount = socialData.emojiUsers[userId] || 0;
				const emojiRank = emojiRankings.findIndex(e => e.userId === userId) + 1;

				// Stickers rank
				const stickerRankings = Object.entries(socialData.stickerUsers)
					.map(([id, count]) => ({ userId: id, count }))
					.filter(e => e.count > 0)
					.sort((a, b) => b.count - a.count);
				const totalStickerUsers = stickerRankings.length;
				const userStickerCount = socialData.stickerUsers[userId] || 0;
				const stickerRank = stickerRankings.findIndex(e => e.userId === userId) + 1;

				// D. Map dynamic fields
				const dynamicFields = [];

				// Top widget titles/subtitles
				dynamicFields.push({ type: 1, name: 'widgettop_title', value: 'Fluffingiously' });
				dynamicFields.push({ type: 1, name: 'widgettop_sub1_text', value: 'Leveling & RPG Bot' });
				dynamicFields.push({ type: 1, name: 'widgettop_sub1_label', value: 'Status' });

				// 1st Stat: Level
				if (connConfig.syncLevel !== false) {
					const levelRankStr = levelRank > 0 ? `#${levelRank}` : '#-';
					dynamicFields.push({
						type: 1,
						name: 'stat1_value',
						value: `Lv. ${userData.level || 0} (${levelRankStr}/${totalLevelUsers})`
					});
					dynamicFields.push({ type: 1, name: 'stat1_label', value: 'User level' });

					dynamicFields.push({ type: 1, name: 'miniprofile_stat_text', value: String(userData.level || 0) });
					dynamicFields.push({ type: 1, name: 'miniprofile_stat_label', value: 'Level' });
					dynamicFields.push({ type: 1, name: 'activityaccessory_stat_text', value: String(userData.level || 0) });
					dynamicFields.push({ type: 1, name: 'activityaccessory_stat_label', value: 'Level' });
				}

				// 2nd Stat: XP
				if (connConfig.syncXP !== false) {
					const currentXp = userData.xp || 0;
					const nextLevel = (userData.level || 0) + 1;
					const xpRequired = getXPRequired(nextLevel);
					const xpPercentage = Math.floor((currentXp / xpRequired) * 100);

					dynamicFields.push({
						type: 1,
						name: 'stat2_value',
						value: `XP. ${xpPercentage}% (${currentXp}/${xpRequired})`
					});
					dynamicFields.push({ type: 1, name: 'stat2_label', value: `Total XP: ${userData.totalXp || 0}` });
				}

				// 3rd Stat: Achievements
				if (connConfig.syncAchievements !== false) {
					const achRankStr = achievementRank > 0 ? `#${achievementRank}` : '#-';
					dynamicFields.push({
						type: 1,
						name: 'stat3_value',
						value: `${achievementsCount}/${totalAchievements} (${achRankStr}/${totalAchievementUsers})`
					});
					dynamicFields.push({ type: 1, name: 'stat3_label', value: 'Achievements' });
				}

				// 4th Stat: Messages seen
				if (connConfig.syncMessages !== false) {
					const msgRankStr = messageRank > 0 ? `#${messageRank}` : '#-';
					dynamicFields.push({
						type: 1,
						name: 'stat4_value',
						value: `${userMessages} (${msgRankStr}/${totalMessageUsers})`
					});
					dynamicFields.push({ type: 1, name: 'stat4_label', value: 'Message seen' });
				}

				// 5th Stat: Emojis used
				if (connConfig.syncEmojis !== false) {
					const emoRankStr = emojiRank > 0 ? `#${emojiRank}` : '#-';
					dynamicFields.push({
						type: 1,
						name: 'stat5_value',
						value: `${userEmojiCount} (${emoRankStr}/${totalEmojiUsers})`
					});
					dynamicFields.push({ type: 1, name: 'stat5_label', value: 'Emojis used' });
				}

				// 6th Stat: Stickers used
				if (connConfig.syncStickers !== false) {
					const stkRankStr = stickerRank > 0 ? `#${stickerRank}` : '#-';
					dynamicFields.push({
						type: 1,
						name: 'stat6_value',
						value: `${userStickerCount} (${stkRankStr}/${totalStickerUsers})`
					});
					dynamicFields.push({ type: 1, name: 'stat6_label', value: 'Stickers used' });
				}

				// Avatar Images (if available)
				if (avatarUrl) {
					dynamicFields.push({ type: 3, name: 'widgettop_image', value: { url: avatarUrl } });
					dynamicFields.push({ type: 3, name: 'miniprofile_heroimage', value: { url: avatarUrl } });
					dynamicFields.push({ type: 3, name: 'miniprofile_stat_icon', value: { url: avatarUrl } });
					dynamicFields.push({ type: 3, name: 'activityaccessory_stat_icon', value: { url: avatarUrl } });
				}

				const widgetPayload = {
					data: {
						dynamic: dynamicFields
					}
				};

				await makeDiscordRequest(
					'PATCH',
					`/api/v9/applications/${CLIENT_ID}/users/${userId}/identities/0/profile`,
					{
						'Authorization': `Bot ${botToken}`,
						'Content-Type': 'application/json',
						'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
					},
					JSON.stringify(widgetPayload)
				);
				console.log(`[Dashboard] Successfully synced Custom Profile Widget (identities/0/profile) for user ${userId}`);
				widgetSuccess = true;
			}
		} catch (error) {
			console.error(`[Dashboard] Failed Custom Profile Widget sync for user ${userId}:`, error.message || error);
		}

		if (!roleConnectionSuccess && !widgetSuccess) {
			throw new Error('Failed to sync both standard Role Connections and Custom Profile Widget.');
		}

		return {
			success: true,
			roleConnectionSuccess,
			widgetSuccess
		};
	} catch (error) {
		console.error(`[Dashboard] Error in syncDiscordConnection for user ${userId}:`, error);
		throw error;
	}
}

/**
 * Parses cookies from HTTP request
 */
function parseCookies(req) {
	const list = {};
	const rc = req.headers.cookie;
	if (rc) {
		rc.split(';').forEach((cookie) => {
			const parts = cookie.split('=');
			list[parts.shift().trim()] = decodeURI(parts.join('='));
		});
	}
	return list;
}

/**
 * Returns authenticated user info if session is valid (or refreshes it if close to expiry)
 */
const RANK_FORMATS = {
	"bot dev": " (bot dev)",
	"den boundless resident": " (den boundless resident)",
	"den disciple echoing": " (den disciple echoing)",
	"den journeyer": " (den journeyer)",
	"den member": " (den member)",
	"member": " (member)"
};

function getHomepageUrl(req) {
	const isLocal = process.platform === 'darwin' || process.cwd().includes('newdramelon');
	const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
	if (isLocal) {
		return `http://localhost:${PORT}`;
	} else {
		return 'https://furred.site';
	}
}

function getDashboardUrl(req) {
	const isLocal = process.platform === 'darwin' || process.cwd().includes('newdramelon');
	const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
	if (isLocal) {
		return `http://bot.localhost:${PORT}`;
	} else {
		return 'https://bot.furred.site';
	}
}

async function getUserEligibleRanks(userId, client) {
	const eligibleRanks = [];

	// 1. Bot Dev
	const botDevs = (process.env.BOT_DEV || '')
		.split(',')
		.map(id => id.trim())
		.filter(id => id.length > 0);
	if (botDevs.includes(userId)) {
		eligibleRanks.push("bot dev");
	}

	// 2. Guilds checks
	const HOMETOWN_GUILD_ID = process.env.HOMETOWN_GUILD_ID || '1447192381479976993';
	const BOT_DEV_GUILD_ID = process.env.BOT_DEV_GUILD_ID || '1492101995094610062';

	const hometownGuild = client.guilds.cache.get(HOMETOWN_GUILD_ID);
	const botDevGuild = client.guilds.cache.get(BOT_DEV_GUILD_ID);

	if (hometownGuild) {
		const hometownMember = await hometownGuild.members.fetch(userId).catch(() => null);
		if (hometownMember) {
			if (hometownMember.roles.cache.has('1466814634718658704')) {
				eligibleRanks.push("den boundless resident");
			}
			if (hometownMember.roles.cache.has('1483379931789656188')) {
				eligibleRanks.push("den disciple echoing");
			}
			if (hometownMember.roles.cache.has('1483380118603960350')) {
				eligibleRanks.push("den journeyer");
			}
			// den member if they have role 1483509124678287491 OR if they are simply present in hometown server
			if (hometownMember.roles.cache.has('1483509124678287491') || hometownMember) {
				eligibleRanks.push("den member");
			}
		}
	}

	if (botDevGuild) {
		const botDevMember = await botDevGuild.members.fetch(userId).catch(() => null);
		if (botDevMember) {
			eligibleRanks.push("member");
		}
	}

	return eligibleRanks;
}

async function getAuthenticatedUser(req, res, client) {
	const cookies = parseCookies(req);
	const sessionId = cookies.session_id;
	if (!sessionId || !sessions[sessionId]) {
		return null;
	}

	const session = sessions[sessionId];
	const now = Date.now();

	// Check if token has expired or is close to expiring (within 5 minutes)
	if (now > session.expiresAt - 5 * 60 * 1000) {
		try {
			console.log(`[Dashboard] Access token for user ${session.username} is expiring. Refreshing...`);
			const CLIENT_ID = process.env.CLIENT_ID;
			const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
			if (!CLIENT_SECRET) {
				throw new Error('DISCORD_CLIENT_SECRET is missing from .env');
			}

			const postData = querystring.stringify({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				grant_type: 'refresh_token',
				refresh_token: session.refreshToken
			});

			const tokenResponse = await makeDiscordRequest(
				'POST',
				'/api/v10/oauth2/token',
				{ 'Content-Type': 'application/x-www-form-urlencoded' },
				postData
			);

			session.accessToken = tokenResponse.access_token;
			session.refreshToken = tokenResponse.refresh_token;
			session.expiresAt = now + (tokenResponse.expires_in * 1000);
			sessions[sessionId] = session;
			saveSessions();
			console.log(`[Dashboard] Access token for user ${session.username} refreshed successfully.`);
		} catch (err) {
			console.error(`[Dashboard] Failed to refresh token for session ${sessionId}:`, err);
			// Session is broken/invalid, remove it
			delete sessions[sessionId];
			saveSessions();
			return null;
		}
	}

	// Verify if user is admin (checking BOT_DEV list in .env)
	const botDevs = (process.env.BOT_DEV || '')
		.split(',')
		.map(id => id.trim())
		.filter(id => id.length > 0);
	const isAdmin = botDevs.includes(session.userId);

	// Construct avatar URL
	let avatarUrl = '';
	if (session.avatar) {
		avatarUrl = `https://cdn.discordapp.com/avatars/${session.userId}/${session.avatar}.png`;
	} else {
		avatarUrl = `https://cdn.discordapp.com/embed/avatars/${parseInt(session.userId) % 5}.png`;
	}

	// Calculate display rank configurations
	let eligibleRanks = [];
	try {
		eligibleRanks = await getUserEligibleRanks(session.userId, client);
	} catch (e) {
		console.error('[Dashboard] Error fetching user eligible ranks:', e);
	}

	const userConfig = userConfigs[session.userId] || {};
	let displayRank = '';
	if (userConfig.displayRank && eligibleRanks.includes(userConfig.displayRank)) {
		displayRank = userConfig.displayRank;
	} else if (eligibleRanks.length > 0) {
		displayRank = eligibleRanks[0];
	}

	const rankText = displayRank ? (RANK_FORMATS[displayRank] || '') : '';

	// Calculate display name (nickname if present in hometown server, else username)
	let displayName = session.username;
	try {
		const HOMETOWN_GUILD_ID = process.env.HOMETOWN_GUILD_ID || '1447192381479976993';
		const hometownGuild = client.guilds.cache.get(HOMETOWN_GUILD_ID);
		if (hometownGuild) {
			const hometownMember = await hometownGuild.members.fetch(session.userId).catch(() => null);
			if (hometownMember && hometownMember.displayName) {
				displayName = hometownMember.displayName;
			}
		}
	} catch (e) {
		console.error('[Dashboard] Error fetching hometown displayName:', e);
	}

	const connectionsConfig = userConfig.connectionsConfig || {
		syncLevel: true,
		syncAchievements: true,
		syncXP: true,
		syncLoyalty: true,
		syncDeveloper: true
	};

	return {
		username: displayName,
		avatarUrl: avatarUrl,
		isAdmin: isAdmin,
		userId: session.userId,
		eligibleRanks: eligibleRanks,
		displayRank: displayRank,
		rankText: rankText,
		connectionsConfig: connectionsConfig
	};
}

/**
 * Starts the Dashboard HTTP server
 * @param {import('discord.js').Client} client 
 */
function startDashboard(client) {
	const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

	if (!process.env.DISCORD_CLIENT_SECRET) {
		console.warn('\x1b[33m%s\x1b[0m', '[Dashboard] WARNING: DISCORD_CLIENT_SECRET is not configured in .env. Discord Login will fail!');
	}

	// Load whitelisted routes
	let routesWhitelist = new Set();
	try {
		const whitelistPath = path.join(__dirname, 'routes_whitelist.txt');
		if (fs.existsSync(whitelistPath)) {
			const content = fs.readFileSync(whitelistPath, 'utf8');
			routesWhitelist = new Set(
				content.split('\n')
					.map(line => line.trim())
					.filter(line => line && !line.startsWith('#'))
			);
			console.log(`[Dashboard Security] Loaded ${routesWhitelist.size} whitelisted routes.`);
		} else {
			console.warn('[Dashboard Security] WARNING: routes_whitelist.txt not found. Running without whitelist protection.');
		}
	} catch (e) {
		console.error('[Dashboard Security] Failed to load routes whitelist:', e);
	}

	const server = http.createServer(async (req, res) => {
		const requestStart = Date.now();
		const originalEnd = res.end;

		const clientIp = req.headers['cf-connecting-ip'] ||
			req.headers['x-forwarded-for']?.split(',')[0].trim() ||
			req.socket?.remoteAddress ||
			req.connection?.remoteAddress ||
			'unknown';

		const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
		const reqUrl = parsedUrl.pathname;

		// Enforce route whitelist
		if (routesWhitelist.size > 0 && !routesWhitelist.has(reqUrl)) {
			console.warn(`[Dashboard Security] Blocked unwhitelisted request: ${req.method} ${reqUrl} from IP ${clientIp}`);
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('Not Found');
		}

		res.end = function (...args) {
			const duration = Date.now() - requestStart;
			apiTracker.recordIncomingRequest({
				method: req.method,
				path: req.url,
				statusCode: res.statusCode || 200,
				duration: duration,
				ip: clientIp,
				reqHeaders: req.headers,
				resHeaders: res.getHeaders()
			});
			return originalEnd.apply(this, args);
		};

		// Allow only GET and POST requests
		if (req.method !== 'GET' && req.method !== 'POST') {
			res.writeHead(405, {
				'Content-Type': 'text/plain',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY'
			});
			return res.end('Method Not Allowed');
		}

		// Security headers
		res.setHeader('X-Frame-Options', 'DENY');
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; script-src 'self' 'unsafe-inline';");

		// Rate Limiting Protection
		if (isRateLimited(clientIp)) {
			res.writeHead(429, { 'Content-Type': 'text/plain' });
			return res.end('Too Many Requests');
		}

		// Route Handling
		const hostHeader = req.headers.host || '';

		if (reqUrl === '/my_server' || reqUrl === '/my_server.html') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user) {
				const redirectTarget = hostHeader.startsWith('bot.')
					? `${getDashboardUrl(req)}/`
					: getHomepageUrl(req);
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(cachedMyServerHtml);
		}

		if (reqUrl === '/my_config' || reqUrl === '/my_config.html') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user) {
				const redirectTarget = hostHeader.startsWith('bot.')
					? `${getDashboardUrl(req)}/`
					: getHomepageUrl(req);
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(cachedMyConfigHtml);
		}

		if (reqUrl === '/log_viewer' || reqUrl === '/log_viewer.html') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				const redirectTarget = hostHeader.startsWith('bot.')
					? `${getDashboardUrl(req)}/`
					: getHomepageUrl(req);
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(cachedLogViewerHtml);
		}

		if (reqUrl === '/admin_panel' || reqUrl === '/admin_panel.html') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				const redirectTarget = hostHeader.startsWith('bot.')
					? `${getDashboardUrl(req)}/`
					: getHomepageUrl(req);
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(cachedAdminPanelHtml);
		}

		if (reqUrl === '/admin_panel/api' || reqUrl === '/admin_panel/api.html') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				const redirectTarget = hostHeader.startsWith('bot.')
					? `${getDashboardUrl(req)}/`
					: getHomepageUrl(req);
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(cachedAdminApiLogsHtml);
		}

		if (reqUrl === '/' || reqUrl === '/index.html' || reqUrl === '/home' || reqUrl === '/home.html' || reqUrl === '/dashboard') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

			// Direct path overrides
			if (reqUrl === '/dashboard') {
				return res.end(cachedHtml);
			}
			if (reqUrl === '/home' || reqUrl === '/home.html') {
				return res.end(cachedHomeHtml);
			}

			// Subdomain-based routing
			if (hostHeader.startsWith('bot.')) {
				return res.end(cachedHtml); // Dashboard
			} else {
				return res.end(cachedHomeHtml); // Homepage
			}
		}

		// Endpoint: GET /api/auth/login - Redirect user to Discord OAuth page
		if (reqUrl === '/api/auth/login') {
			const CLIENT_ID = process.env.CLIENT_ID;
			if (!CLIENT_ID) {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				return res.end('Server configuration error: client id is missing');
			}

			const from = parsedUrl.searchParams.get('from') || 'dashboard';

			// Check if user already has a valid session
			let hasSession = false;
			try {
				const user = await getAuthenticatedUser(req, res, client);
				if (user) {
					hasSession = true;
				}
			} catch (e) { }

			if (hasSession) {
				// Redirect immediately back to appropriate page
				const redirectTarget = from === 'home' ? getHomepageUrl(req) : `${getDashboardUrl(req)}/`;
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}

			const isLocal = process.platform === 'darwin' || process.cwd().includes('newdramelon');
			const host = req.headers.host || (isLocal ? `localhost:${PORT}` : 'bot.furred.site');
			const protocol = req.headers['x-forwarded-proto'] || (req.socket.encrypted || req.headers.host?.includes('furred') ? 'https' : 'http');
			const REDIRECT_URI = process.env.DASHBOARD_REDIRECT_URI || `${protocol}://${host}/api/auth/callback`;

			const scopes = 'identify guilds role_connections.write';
			const discordLoginUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(from)}`;

			res.writeHead(302, { 'Location': discordLoginUrl });
			return res.end();
		}

		// Endpoint: GET /api/auth/callback - Handle OAuth redirect code exchange
		if (reqUrl === '/api/auth/callback') {
			const state = parsedUrl.searchParams.get('state') || 'dashboard';
			const error = parsedUrl.searchParams.get('error');

			// Handle cancellation / error redirecting back to source
			if (error) {
				console.log(`[Dashboard] OAuth2 error callback: ${error}`);
				const redirectTarget = state === 'home' ? getHomepageUrl(req) : `${getDashboardUrl(req)}/`;
				res.writeHead(302, { 'Location': redirectTarget });
				return res.end();
			}

			const code = parsedUrl.searchParams.get('code');
			if (!code) {
				res.writeHead(400, { 'Content-Type': 'text/plain' });
				return res.end('Bad Request: Missing OAuth2 code');
			}

			const CLIENT_ID = process.env.CLIENT_ID;
			const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
			if (!CLIENT_SECRET) {
				console.error('[Dashboard] DISCORD_CLIENT_SECRET is missing from .env');
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				return res.end('Server configuration error: client secret is missing in .env');
			}

			const isLocal = process.platform === 'darwin' || process.cwd().includes('newdramelon');
			const host = req.headers.host || (isLocal ? `localhost:${PORT}` : 'bot.furred.site');
			const protocol = req.headers['x-forwarded-proto'] || (req.socket.encrypted || req.headers.host?.includes('furred') ? 'https' : 'http');
			const REDIRECT_URI = process.env.DASHBOARD_REDIRECT_URI || `${protocol}://${host}/api/auth/callback`;

			const postData = querystring.stringify({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: REDIRECT_URI
			});

			try {
				const tokenResponse = await makeDiscordRequest(
					'POST',
					'/api/v10/oauth2/token',
					{ 'Content-Type': 'application/x-www-form-urlencoded' },
					postData
				);

				const accessToken = tokenResponse.access_token;
				const refreshToken = tokenResponse.refresh_token;
				const expiresIn = tokenResponse.expires_in;
				const expiresAt = Date.now() + (expiresIn * 1000);

				// Fetch User profile details
				const userResponse = await makeDiscordRequest(
					'GET',
					'/api/v10/users/@me',
					{ 'Authorization': `Bearer ${accessToken}` }
				);

				const userId = userResponse.id;
				const username = userResponse.username;
				const avatar = userResponse.avatar;

				// Generate secure session ID
				const sessionId = crypto.randomBytes(32).toString('hex');

				// Save session data
				sessions[sessionId] = {
					userId,
					username,
					avatar,
					accessToken,
					refreshToken,
					expiresAt
				};
				saveSessions();

				// Set Session Cookie
				const cookieOptions = [
					`session_id=${sessionId}`,
					'Path=/',
					'HttpOnly',
					'Max-Age=2592000', // 30 days
					'SameSite=Lax'
				];
				if (protocol === 'https') {
					cookieOptions.push('Secure');
				}
				// Domain cookie sharing for furred.site and subdomains (using dot prefix)
				if (hostHeader.includes('furred.site')) {
					cookieOptions.push('Domain=.furred.site');
				}

				const redirectTarget = state === 'home' ? getHomepageUrl(req) : `${getDashboardUrl(req)}/`;

				res.writeHead(302, {
					'Set-Cookie': cookieOptions.join('; '),
					'Location': redirectTarget
				});
				return res.end();
			} catch (err) {
				console.error('[Dashboard] OAuth2 Callback Error:', err);
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				return res.end('Authentication failed: ' + err.message);
			}
		}

		// Endpoint: GET /api/auth/logout - Clear session
		if (reqUrl === '/api/auth/logout') {
			const cookies = parseCookies(req);
			const sessionId = cookies.session_id;
			if (sessionId && sessions[sessionId]) {
				delete sessions[sessionId];
				saveSessions();
			}
			const deleteCookieOptions = [
				'session_id=',
				'Path=/',
				'HttpOnly',
				'Max-Age=0',
				'SameSite=Lax'
			];
			if (hostHeader.includes('furred.site')) {
				deleteCookieOptions.push('Domain=.furred.site');
			}

			res.writeHead(302, {
				'Set-Cookie': deleteCookieOptions.join('; '),
				'Location': '/'
			});
			return res.end();
		}

		// Endpoint: GET /api/user/guilds - Fetch user's Discord guilds categorized by bot presence
		if (reqUrl === '/api/user/guilds') {
			const cookies = parseCookies(req);
			const sessionId = cookies.session_id;
			if (!sessionId || !sessions[sessionId]) {
				res.writeHead(401, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({ error: 'Unauthorized' }));
			}

			const session = sessions[sessionId];

			try {
				// Fetch user's guilds from Discord
				const userGuilds = await makeDiscordRequest(
					'GET',
					'/api/v10/users/@me/guilds',
					{ 'Authorization': `Bearer ${session.accessToken}` }
				);

				if (!Array.isArray(userGuilds)) {
					throw new Error('Invalid response from Discord API');
				}

				const CLIENT_ID = process.env.CLIENT_ID || '';
				const managedGuilds = [];
				const inviteGuilds = [];

				for (const guild of userGuilds) {
					// Check permissions (MANAGE_GUILD: 0x20 or ADMINISTRATOR: 0x8)
					const permissions = BigInt(guild.permissions);
					const hasManageGuild = (permissions & 0x20n) === 0x20n;
					const hasAdmin = (permissions & 0x8n) === 0x8n;

					if (hasManageGuild || hasAdmin) {
						const botInGuild = client && client.isReady() && client.guilds.cache.has(guild.id);

						const guildInfo = {
							id: guild.id,
							name: guild.name,
							iconUrl: guild.icon
								? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
								: null,
							botInGuild: botInGuild
						};

						if (botInGuild) {
							managedGuilds.push(guildInfo);
						} else {
							guildInfo.inviteUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}&disable_guild_select=true`;
							inviteGuilds.push(guildInfo);
						}
					}
				}

				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({
					managed: managedGuilds,
					inviteable: inviteGuilds
				}));

			} catch (err) {
				console.error('[Dashboard] Error fetching user guilds:', err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({ error: 'Failed to fetch guilds: ' + err.message }));
			}
		}

		// Endpoint: POST /api/user/config - Save display rank configuration for the logged-in user
		if (reqUrl === '/api/user/config' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => {
				body += chunk;
			});
			req.on('end', async () => {
				try {
					const cookies = parseCookies(req);
					const sessionId = cookies.session_id;
					if (!sessionId || !sessions[sessionId]) {
						res.writeHead(401, { 'Content-Type': 'text/plain' });
						return res.end('Unauthorized');
					}

					const session = sessions[sessionId];
					const parsed = JSON.parse(body);

					// Fetch eligible ranks to validate rank ownership
					const userRanks = await getUserEligibleRanks(session.userId, client);

					const displayRank = parsed.displayRank || '';
					if (displayRank && !userRanks.includes(displayRank)) {
						res.writeHead(400, { 'Content-Type': 'text/plain' });
						return res.end('Bad Request: User does not qualify for this rank');
					}

					userConfigs[session.userId] = {
						...(userConfigs[session.userId] || {}),
						displayRank: displayRank
					};
					saveUserConfigs();

					res.writeHead(200, { 'Content-Type': 'application/json' });
					return res.end(JSON.stringify({ success: true }));
				} catch (err) {
					console.error('[Dashboard] Error saving config:', err);
					res.writeHead(500, { 'Content-Type': 'text/plain' });
					return res.end('Internal Server Error');
				}
			});
			return;
		}

		// Endpoint: POST /api/user/connections-config - Save connection sync config and trigger sync
		if (reqUrl === '/api/user/connections-config' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => {
				body += chunk;
			});
			req.on('end', async () => {
				try {
					const user = await getAuthenticatedUser(req, res, client).catch(() => null);
					if (!user) {
						res.writeHead(401, { 'Content-Type': 'text/plain' });
						return res.end('Unauthorized');
					}

					const cookies = parseCookies(req);
					const sessionId = cookies.session_id;
					const session = sessions[sessionId];
					const parsed = JSON.parse(body);

					// Initialize default connection config if not present
					const connectionsConfig = parsed.connectionsConfig || {
						syncLevel: true,
						syncAchievements: true,
						syncXP: true,
						syncLoyalty: true,
						syncDeveloper: true
					};

					userConfigs[session.userId] = {
						...(userConfigs[session.userId] || {}),
						connectionsConfig: connectionsConfig
					};
					saveUserConfigs();

					// Sync with Discord immediately
					await syncDiscordConnection(session.userId, client, session.accessToken);

					res.writeHead(200, { 'Content-Type': 'application/json' });
					return res.end(JSON.stringify({ success: true }));
				} catch (err) {
					console.error('[Dashboard] Error saving connections-config:', err);
					res.writeHead(500, { 'Content-Type': 'text/plain' });
					return res.end('Internal Server Error: ' + err.message);
				}
			});
			return;
		}


		// Endpoint: GET /api/admin/logs - Fetch last 200 lines of bot.log
		if (reqUrl === '/api/admin/logs' && req.method === 'GET') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				res.writeHead(403, { 'Content-Type': 'text/plain' });
				return res.end('Forbidden');
			}

			const logFile = path.join(process.cwd(), 'data', 'logs', 'bot.log');
			if (fs.existsSync(logFile)) {
				try {
					const content = fs.readFileSync(logFile, 'utf8');
					const lines = content.split('\n');
					const lastLines = lines.slice(-200).join('\n');
					res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
					return res.end(lastLines);
				} catch (e) {
					console.error('[Dashboard] Error reading logs:', e);
					res.writeHead(500, { 'Content-Type': 'text/plain' });
					return res.end('Error reading log file');
				}
			} else {
				res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
				return res.end('No logs recorded yet.');
			}
		}

		// Endpoint: GET /api/admin/api_logs - Fetch paginated and filtered API logs
		if (reqUrl === '/api/admin/api_logs' && req.method === 'GET') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				res.writeHead(403, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({ error: 'Forbidden' }));
			}

			const type = parsedUrl.searchParams.get('type') || '';
			const statusCode = parsedUrl.searchParams.get('statusCode') || '';
			const method = parsedUrl.searchParams.get('method') || '';
			const search = parsedUrl.searchParams.get('search') || '';
			const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
			const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);

			try {
				const logBaseDir = path.join(process.cwd(), 'data', 'logs');
				const getApiLogFiles = () => {
					const results = [];
					const scan = (dir) => {
						if (!fs.existsSync(dir)) return;
						const items = fs.readdirSync(dir, { withFileTypes: true });
						for (const item of items) {
							const fullPath = path.join(dir, item.name);
							if (item.isDirectory()) {
								scan(fullPath);
							} else if (item.isFile() && item.name.endsWith('-API.jsonl')) {
								results.push(fullPath);
							}
						}
					};
					scan(logBaseDir);
					results.sort((a, b) => b.localeCompare(a));
					return results;
				};

				const files = getApiLogFiles();
				const allMatched = [];

				for (const file of files) {
					try {
						const content = fs.readFileSync(file, 'utf8');
						const lines = content.split('\n');
						// Reverse: newest logs first
						for (let i = lines.length - 1; i >= 0; i--) {
							const line = lines[i].trim();
							if (!line) continue;
							try {
								const entry = JSON.parse(line);

								// Filter by type
								if (type && entry.type !== type) continue;

								// Filter by statusCode
								if (statusCode) {
									const codeStr = String(entry.statusCode);
									if (statusCode === '2xx') {
										if (entry.statusCode < 200 || entry.statusCode >= 300) continue;
									} else if (statusCode === '3xx') {
										if (entry.statusCode < 300 || entry.statusCode >= 400) continue;
									} else if (statusCode === '4xx') {
										if (entry.statusCode < 400 || entry.statusCode >= 500) continue;
									} else if (statusCode === '5xx') {
										if (entry.statusCode < 500) continue;
									} else if (statusCode === '429') {
										if (entry.statusCode !== 429) continue;
									} else {
										if (codeStr !== statusCode) continue;
									}
								}

								// Filter by method
								if (method && entry.method?.toUpperCase() !== method.toUpperCase()) continue;

								// Filter by search term
								if (search) {
									const s = search.toLowerCase();
									const pathMatch = entry.path?.toLowerCase().includes(s);
									const ipMatch = entry.ip?.toLowerCase().includes(s);
									const errorMatch = entry.error?.toLowerCase().includes(s);
									if (!pathMatch && !ipMatch && !errorMatch) continue;
								}

								allMatched.push(entry);
							} catch (e) {
								// ignore bad line
							}
						}
					} catch (fileErr) {
						console.error('[Dashboard] Error reading file ' + file + ':', fileErr);
					}
				}

				const total = allMatched.length;
				const startIndex = (page - 1) * limit;
				const paginated = allMatched.slice(startIndex, startIndex + limit);

				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({
					logs: paginated,
					total,
					page,
					limit,
					totalPages: Math.ceil(total / limit)
				}));
			} catch (err) {
				console.error('[Dashboard] Error loading api logs:', err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({ error: 'Error reading API logs' }));
			}
		}

		// Endpoint: POST /api/admin/bot_status - Update bot custom status activity text
		if (reqUrl === '/api/admin/bot_status' && req.method === 'POST') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				res.writeHead(403, { 'Content-Type': 'text/plain' });
				return res.end('Forbidden');
			}

			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				try {
					const parsed = JSON.parse(body);
					const statusText = parsed.statusText || '';
					if (client && client.isReady()) {
						client.user.setActivity(statusText);
						console.log(`[Admin] Bot custom activity status updated to: "${statusText}"`);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						return res.end(JSON.stringify({ success: true }));
					} else {
						res.writeHead(500, { 'Content-Type': 'text/plain' });
						return res.end('Discord client is not ready');
					}
				} catch (e) {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					return res.end('Bad Request');
				}
			});
			return;
		}

		// Endpoint: POST /api/admin/restart - Gracefully exit bot process
		if (reqUrl === '/api/admin/restart' && req.method === 'POST') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				res.writeHead(403, { 'Content-Type': 'text/plain' });
				return res.end('Forbidden');
			}

			console.warn('[Admin] Graceful restart requested via Admin Panel. Exiting process...');
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: true }));

			setTimeout(() => {
				process.exit(0);
			}, 1000);
			return;
		}

		// Endpoint: GET /api/site/config - Get dynamic dashboard layout categories and widgets
		if (reqUrl === '/api/site/config' && req.method === 'GET') {
			const configPath = path.join(process.cwd(), 'data', 'siteConfigs.json');
			const defaultLayout = {
				categories: [
					{
						id: "bot_metrics",
						name: "Bot Metrics",
						cards: ["uptime", "servers", "installs"]
					},
					{
						id: "system_diagnostics",
						name: "System Diagnostics",
						cards: ["environment", "api_ping", "ram_usage"]
					}
				]
			};

			try {
				if (fs.existsSync(configPath)) {
					const raw = fs.readFileSync(configPath, 'utf8');
					if (raw.trim()) {
						const parsed = JSON.parse(raw);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						return res.end(JSON.stringify(parsed));
					}
				}

				// File does not exist or is empty, write default layout
				const dataDir = path.dirname(configPath);
				if (!fs.existsSync(dataDir)) {
					fs.mkdirSync(dataDir, { recursive: true });
				}
				fs.writeFileSync(configPath, JSON.stringify(defaultLayout, null, 2), 'utf8');
				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify(defaultLayout));
			} catch (err) {
				console.error('[Dashboard] Error reading/writing siteConfigs.json:', err);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify(defaultLayout));
			}
		}

		// Endpoint: POST /api/site/config - Save updated dynamic layout config (Admins only)
		if (reqUrl === '/api/site/config' && req.method === 'POST') {
			const user = await getAuthenticatedUser(req, res, client).catch(() => null);
			if (!user || !user.isAdmin) {
				res.writeHead(403, { 'Content-Type': 'text/plain' });
				return res.end('Forbidden');
			}

			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				try {
					const parsed = JSON.parse(body);
					if (!parsed.categories || !Array.isArray(parsed.categories)) {
						res.writeHead(400, { 'Content-Type': 'text/plain' });
						return res.end('Bad Request: categories array missing');
					}

					const configPath = path.join(process.cwd(), 'data', 'siteConfigs.json');
					const dataDir = path.dirname(configPath);
					if (!fs.existsSync(dataDir)) {
						fs.mkdirSync(dataDir, { recursive: true });
					}
					fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf8');
					console.log(`[Admin] Dashboard layout config updated by ${user.username}`);

					res.writeHead(200, { 'Content-Type': 'application/json' });
					return res.end(JSON.stringify({ success: true }));
				} catch (err) {
					console.error('[Dashboard] Error saving config updates:', err);
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					return res.end('Bad Request');
				}
			});
			return;
		}

		// Endpoint: GET /api/status - Get bot diagnostics and authenticated user profile
		if (reqUrl === '/api/status') {
			const since = parsedUrl.searchParams.get('since') ? parseInt(parsedUrl.searchParams.get('since'), 10) : null;
			res.writeHead(200, { 'Content-Type': 'application/json' });

			let authUser = null;
			try {
				authUser = await getAuthenticatedUser(req, res, client);
			} catch (authErr) {
				console.error('[Dashboard] Error verifying user session:', authErr);
			}

			// If Discord client is not ready, return minimal starting status
			if (!client || !client.isReady()) {
				const envStr = isLocal ? 'Local PC' : 'VPS Server';

				return res.end(JSON.stringify({
					online: false,
					status: 'starting',
					uptime: process.uptime(),
					uptimeStr: formatDuration(process.uptime()),
					environment: envStr,
					memory: getMemoryStats(),
					user: authUser,
					bot: {
						username: 'Fluffingiously',
						avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
						status: 'starting'
					},
					system: {
						platform: `${os.type()} (${os.arch()})`,
						nodeVersion: process.version,
						memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
						uptime: formatDuration(process.uptime())
					},
					apiTracker: apiTracker.getStats(since)
				}));
			}

			// Discord client is ready, return full status metrics
			try {
				const currentUptime = process.uptime();
				const serverCount = client.guilds.cache.size;
				const installCount = client.application ? (client.application.approximateUserInstallCount || 0) : 0;

				// Environment detection matching statusChannelUpdater.js
				const envStr = isLocal ? 'Local PC' : 'VPS Server';

				const reliability = calculateReliability();

				const statusPayload = {
					online: true,
					status: 'online',
					botTag: client.user.tag,
					botAvatar: client.user.displayAvatarURL({ extension: 'png', size: 128 }),
					bot: {
						username: client.user.username,
						avatarUrl: client.user.displayAvatarURL({ extension: 'png', size: 128 }),
						status: 'online'
					},
					uptime: currentUptime,
					uptimeStr: formatDuration(currentUptime),
					servers: serverCount,
					installs: installCount,
					environment: envStr,
					ping: client.ws.ping,
					memory: getMemoryStats(),
					hourlyBlocks: reliability.hourlyBlocks,
					dailyBlocks: reliability.dailyBlocks,
					outages: reliability.outages,
					user: authUser,
					system: {
						platform: `${os.type()} (${os.arch()})`,
						nodeVersion: process.version,
						memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
						uptime: formatDuration(process.uptime())
					},
					apiTracker: apiTracker.getStats(since)
				};

				return res.end(JSON.stringify(statusPayload));
			} catch (err) {
				console.error('[Dashboard] Error generating status payload:', err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({ error: 'Internal Server Error' }));
			}
		}

		// Fallback for not found files (404)
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return res.end('Not Found');
	});

	server.listen(PORT, '0.0.0.0', () => {
		console.log(`[Dashboard] Web dashboard server running on port ${PORT}`);
		registerConnectionMetadata(client);
	});

	// Handle server error events
	server.on('error', (err) => {
		console.error('[Dashboard] Server error:', err);
	});
}

/**
 * Returns formatted memory usage stats in MB
 */
function getMemoryStats() {
	const mem = process.memoryUsage();
	return {
		heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
		heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
		rss: Math.round(mem.rss / 1024 / 1024 * 10) / 10
	};
}

module.exports = {
	startDashboard
};
