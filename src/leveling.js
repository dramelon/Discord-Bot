const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'levels.json');

function getXPRequired(level) {
	if (level <= 1) return 5;
	const q = Math.floor((level - 1) / 10);
	return (level - 5 * q) * (q + 1) + 8;
}

function ensureDataExists() {
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
	if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({}), 'utf8');
}

function getFullLevelData() {
	ensureDataExists();
	try {
		const content = fs.readFileSync(dataPath, 'utf8');
		return JSON.parse(content) || {};
	} catch (e) {
		console.error('Error reading levels.json:', e);
		return {};
	}
}

function saveFullLevelData(data) {
	ensureDataExists();
	try {
		fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
	} catch (e) {
		console.error('Error saving levels.json:', e);
	}
}

function getUserLevelData(userId) {
	const data = getFullLevelData();
	if (!data[userId]) {
		data[userId] = { xp: 0, totalXp: 0, level: 0 };
	}
	const user = data[userId];
	if (user.totalXp === undefined) user.totalXp = user.xp;
	return user;
}

function addXP(userId, amount, userObj = null) {
	const data = getFullLevelData();
	if (!data[userId]) data[userId] = { xp: 0, totalXp: 0, level: 0 };
	const user = data[userId];

	if (userObj) {
		user.username = userObj.username;
		user.displayname = userObj.displayName || userObj.username;
	}

	user.xp += amount;
	user.totalXp += (amount > 0 ? amount : 0);

	let leveledUp = false;
	// Handle Level Up
	while (true) {
		const nextLevel = user.level + 1;
		const required = getXPRequired(nextLevel);
		if (user.xp >= required) {
			user.xp -= required;
			user.level++;
			leveledUp = true;
		} else {
			break;
		}
	}

	saveFullLevelData(data);
	return leveledUp ? user.level : null;
}

function removeXP(userId, amount) {
	const data = getFullLevelData();
	if (!data[userId]) return;
	const user = data[userId];

	user.xp -= amount;
	if (user.xp < 0) {
		// Demote level if xp goes negative?
		while (user.xp < 0 && user.level > 0) {
			const prevLevelXp = getXPRequired(user.level);
			user.xp += prevLevelXp;
			user.level--;
		}
		if (user.xp < 0) user.xp = 0;
	}

	saveFullLevelData(data);
}

function removeLevel(userId, amount) {
	const data = getFullLevelData();
	if (!data[userId]) return;
	const user = data[userId];

	user.level = Math.max(0, user.level - amount);
	// Optionally reset XP in current level? User didn't specify, so I'll leave it as is or reset if 0 level.
	saveFullLevelData(data);
}

// The message listener for global chat XP
async function levelSystemListener(message) {
	if (message.author.bot || !message.guild) return;

	const levelUp = addXP(message.author.id, 1, message.author);
	if (levelUp !== null) {
		await message.channel.send(`🎉 ${message.author}, you've leveled up to **Level ${levelUp}**!`);
	}
}

module.exports = {
	levelSystemListener,
	getUserLevelData,
	addXP,
	removeXP,
	removeLevel,
	getXPRequired
};