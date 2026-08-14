const { EmbedBuilder } = require('discord.js');
const dbManager = require('./backend/dbManager');

function getXPRequired(level) {
	if (level <= 1) return 5;
	const q = Math.floor((level - 1) / 10);
	return (level - 5 * q) * (q + 1) + 8;
}

function getUserLevelData(userId) {
	const user = dbManager.getUserLevelData(userId);
	if (user.totalXp === undefined) user.totalXp = user.xp;
	if (user.totalMessages === undefined) user.totalMessages = user.totalXp; // Default messages to totalXp
	return user;
}

function addXP(userId, amount, userObj = null, notifyContext = null) {
	const user = getUserLevelData(userId);

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

	dbManager.saveUserLevelData(userId, user);

	if (leveledUp && notifyContext) {
		sendLevelUpNotification(notifyContext, userObj || { id: userId, username: user.username }, user.level);
	}

	return leveledUp ? user.level : null;
}

/**
 * Sends a premium Level Up notification
 */
async function sendLevelUpNotification(context, user, newLevel) {
	if (newLevel > 5 && newLevel % 5 !== 0) return;

	let targetChannel = context.channel;

	// Check if server is configured for specific leveling notification types
	const guildId = context.guild?.id;
	if (guildId) {
		try {
			const { getConfig } = require('./utils/configManager');
			const config = getConfig(guildId);
			if (config) {
				const type = config.levelUpType || 'popup';
				if (type === 'disabled') {
					return; // Level up notifications disabled
				}
				if (type === 'channel' && config.levelUpChannelId) {
					const destChannel = context.guild.channels.cache.get(config.levelUpChannelId);
					if (destChannel) {
						targetChannel = destChannel;
					}
				}
			}
		} catch (err) {
			console.error('Error fetching server config for leveling notification:', err);
		}
	}

	const embed = new EmbedBuilder()
		.setTitle('🎊 Level Up!')
		.setDescription(`Congratulations <@${user.id}>! You have reached **Level ${newLevel}**!`)
		.setThumbnail(user.displayAvatarURL ? user.displayAvatarURL() : null)
		.setColor(0x00FF00);

	if (newLevel <= 5) {
		embed.setFooter({ text: 'Keep yapping and playing to unlock more!\nHint: You can remove this message by reacting with ❌' });
	} else {
		embed.setFooter({ text: 'Keep yapping and playing to unlock more!' });
	}

	try {
        if (targetChannel) {
            const msg = await targetChannel.send({ embeds: [embed] });
            
            // Add reaction
            await msg.react('❌').catch(() => {});
        }
	} catch (e) {
		console.error('Error sending level up notification:', e);
	}
}

function addMessage(userId) {
	const user = getUserLevelData(userId);
	
	if (user.totalMessages === undefined) {
		user.totalMessages = (user.totalXp || 0);
	}
	user.totalMessages++;
	
	dbManager.saveUserLevelData(userId, user);
}

function removeXP(userId, amount) {
	const user = getUserLevelData(userId);

	user.xp -= amount;
	if (user.xp < 0) {
		while (user.xp < 0 && user.level > 0) {
			const prevLevelXp = getXPRequired(user.level);
			user.xp += prevLevelXp;
			user.level--;
		}
		if (user.xp < 0) user.xp = 0;
	}

	dbManager.saveUserLevelData(userId, user);
}

function removeLevel(userId, amount) {
	const user = getUserLevelData(userId);

	user.level = Math.max(0, user.level - amount);
	dbManager.saveUserLevelData(userId, user);
}

function setLevel(userId, level) {
	const user = getUserLevelData(userId);

	user.level = Math.max(0, level);
	user.xp = 0;
	dbManager.saveUserLevelData(userId, user);
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