const { EmbedBuilder } = require('discord.js');
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
		data[userId] = { xp: 0, totalXp: 0, level: 0, totalMessages: 0 };
	}
	const user = data[userId];
	if (user.totalXp === undefined) user.totalXp = user.xp;
	if (user.totalMessages === undefined) user.totalMessages = user.totalXp; // Migration: initially messages = totalXp
	return user;
}

function addXP(userId, amount, userObj = null, notifyContext = null) {
	const data = getFullLevelData();
	if (!data[userId]) data[userId] = { xp: 0, totalXp: 0, level: 0, totalMessages: 0 };
	const user = data[userId];

	if (userObj) {
		user.username = userObj.username;
		user.displayname = userObj.displayName || userObj.username;
	}

	user.xp += amount;
	user.totalXp += (amount > 0 ? amount : 0);
	
	// Ensure totalMessages exists
	if (user.totalMessages === undefined) user.totalMessages = user.totalXp - (amount > 0 ? amount : 0);

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

	if (leveledUp && notifyContext) {
		sendLevelUpNotification(notifyContext, userObj || { id: userId, username: user.username }, user.level);
	}

	return leveledUp ? user.level : null;
}

/**
 * Sends a premium Level Up notification
 */
async function sendLevelUpNotification(context, user, newLevel) {
	const embed = new EmbedBuilder()
		.setTitle('🎊 Level Up!')
		.setDescription(`Congratulations <@${user.id}>! You have reached **Level ${newLevel}**!`)
		.setThumbnail(user.displayAvatarURL ? user.displayAvatarURL() : null)
		.setColor(0x00FF00)
		.setFooter({ text: 'Keep chatting and playing to unlock more!' });

	try {
        // If it's an interaction and hasn't been replied to, we might want to followUp
        // But the user specifically said "sending a separates one" and "no need to replies back to the command"
        // So we use channel.send regardless of context type if possible.
        const channel = context.channel;
        if (channel) {
            await channel.send({ embeds: [embed] });
        }
	} catch (e) {
		console.error('Error sending level up notification:', e);
	}
}

function addMessage(userId) {
	const data = getFullLevelData();
	if (!data[userId]) data[userId] = { xp: 0, totalXp: 0, level: 0, totalMessages: 0 };
	const user = data[userId];
	
	if (user.totalMessages === undefined) {
		user.totalMessages = (user.totalXp || 0);
	}
	user.totalMessages++;
	
	saveFullLevelData(data);
}

function removeXP(userId, amount) {
	const data = getFullLevelData();
	if (!data[userId]) return;
	const user = data[userId];

	user.xp -= amount;
	if (user.xp < 0) {
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
	saveFullLevelData(data);
}

function setLevel(userId, level) {
	const data = getFullLevelData();
	if (!data[userId]) data[userId] = { xp: 0, totalXp: 0, level: 0, totalMessages: 0 };
	const user = data[userId];

	user.level = Math.max(0, level);
	user.xp = 0;
	saveFullLevelData(data);
}

/**
 * Message listener for global chat XP and message counting
 */
async function levelSystemListener(message) {
	if (message.author.bot || !message.guild) return;

	// Increment message count
	addMessage(message.author.id);

	// Add 1 XP for the message and notify in-place
	addXP(message.author.id, 1, message.author, message);
}

module.exports = {
	levelSystemListener,
	getUserLevelData,
	addXP,
	addMessage,
	removeXP,
	removeLevel,
	setLevel,
	getXPRequired
};