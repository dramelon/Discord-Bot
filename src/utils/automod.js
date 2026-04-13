const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Constants for IDs
const GUILD_ID = '1447192381479976993';
const AUDIT_CHANNEL_ID = '1470768247208149146';
const MUTED_ROLE_ID = '1491397480842133545';
const ADMIN_ROLE_ID = '1466814634718658704';

// 30-second cleanup window, 10-second spam window
const CLEANUP_WINDOW = 30 * 1000;
const SPAM_WINDOW = 10 * 1000;

/**
 * SCAM_PATTERNS
 * Separated section for future maintainability as requested.
 */
const SCAM_PATTERNS = {
	// Links that are almost always scams
	Links: [
		/discord.*nitro/i,
		/discord.*gift/i,
		/free.*nitro/i,
		/nitro.*free/i,
		/dlscord/i,
		/dlsclord/i,
		/discord-app/i,
		/discord-gift/i,
		/steam.*nitro/i,
		/steancommunity/i,
		/steamloophole/i,
		/giveaway/i,
		/\.exe$/i,
		/\.scr$/i
	],
	// Suspicious phrases
	Phrases: [
		"everyone get nitro",
		"free nitro for everyone",
		"click here for free nitro",
		"steam gift for you",
		"nitro gift from friend"
	]
};

// In-memory message tracker: Map<userId, Array<{content, timestamp, channelId, messageId}>>
const messageCache = new Map();

/**
 * Prunes old messages from the cache
 */
function pruneCache(userId) {
	const now = Date.now();
	const messages = messageCache.get(userId);
	if (!messages) return;

	const validMessages = messages.filter(m => now - m.timestamp < CLEANUP_WINDOW);
	if (validMessages.length === 0) {
		messageCache.delete(userId);
	} else {
		messageCache.set(userId, validMessages);
	}
}

/**
 * Main Automod Listener
 */
module.exports = async (message) => {
	// Basic checks
	if (message.author.bot) return;
	if (message.guildId !== GUILD_ID) return;
	if (!message.guild || !message.member) return;

	const userId = message.author.id;
	const content = message.content.toLowerCase();
	const now = Date.now();

	// Track the current message
	if (!messageCache.has(userId)) messageCache.set(userId, []);
	const userHistory = messageCache.get(userId);
	userHistory.push({
		content: message.content,
		timestamp: now,
		channelId: message.channelId,
		messageId: message.id
	});
	pruneCache(userId);

	let reason = null;

	// 1. Scam Link/Phrase Detection
	const isScamLink = SCAM_PATTERNS.Links.some(pattern => pattern.test(content));
	const isScamPhrase = SCAM_PATTERNS.Phrases.some(phrase => content.includes(phrase));
	
	if (isScamLink || isScamPhrase) {
		reason = "Suspicious scam/virus link or message detected.";
	}

	// 2. Spam/Ping Detection (within 10s)
	if (!reason) {
		const recentMessages = userHistory.filter(m => now - m.timestamp < SPAM_WINDOW);
		
		// Check for same message in multiple channels
		const uniqueChannels = new Set(recentMessages.map(m => m.channelId));
		const duplicateContentCount = recentMessages.filter(m => m.content === message.content).length;

		if (duplicateContentCount >= 3 && uniqueChannels.size >= 2) {
			reason = "Spamming the same message across multiple channels.";
		}

		// Check for @everyone or @here pings
		const pingCount = (message.content.match(/@(everyone|here)/g) || []).length;
		const totalRecentPings = recentMessages.reduce((sum, m) => sum + (m.content.match(/@(everyone|here)/g) || []).length, 0);

		// Trigger if multiple pings in 10s or if unauthorized (simulated by strict check)
		if (totalRecentPings >= 3 || (pingCount > 0 && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone))) {
			reason = "Excessive or unauthorized @everyone/@here pings detected.";
		}
	}

	if (reason) {
		await handleAutomodViolation(message, reason);
	}
};

/**
 * Action Logic: Forward -> Punish -> Cleanup -> Log
 */
async function handleAutomodViolation(message, reason) {
	const { guild, member, author, channel } = message;
	const auditChannel = guild.channels.cache.get(AUDIT_CHANNEL_ID);

	try {
		// 1. Forward the suspicious message FIRST
		if (auditChannel) {
			const forwardEmbed = new EmbedBuilder()
				.setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
				.setTitle("🚨 Suspicious Message Flagged")
				.setDescription(message.content || "*[No content (possibly an image/sticker)]*")
				.addFields(
					{ name: "Reason", value: reason, inline: true },
					{ name: "Channel", value: `<#${channel.id}>`, inline: true },
					{ name: "User ID", value: author.id, inline: true }
				)
				.setColor(0xFF0000)
				.setTimestamp();

			await auditChannel.send({ embeds: [forwardEmbed] });
		}

		// 2. Punish: Timeout + Role Add + Admin Role Remove
		// 1-day timeout
		await member.timeout(24 * 60 * 60 * 1000, `Automod: ${reason}`).catch(console.error);

		// Add restrictive role
		const mutedRole = guild.roles.cache.get(MUTED_ROLE_ID);
		if (mutedRole) await member.roles.add(mutedRole).catch(console.error);

		// Remove admin role if present
		if (member.roles.cache.has(ADMIN_ROLE_ID)) {
			await member.roles.remove(ADMIN_ROLE_ID).catch(console.error);
		}

		// 3. Cleanup: Delete all messages from this user in the last 30s
		const userHistory = messageCache.get(author.id) || [];
		for (const msgData of userHistory) {
			try {
				const targetChannel = guild.channels.cache.get(msgData.channelId);
				if (targetChannel) {
					const msgToDelete = await targetChannel.messages.fetch(msgData.messageId).catch(() => null);
					if (msgToDelete && msgToDelete.deletable) {
						await msgToDelete.delete();
					}
				}
			} catch (err) {
				console.error(`Failed to delete message ${msgData.messageId}:`, err);
			}
		}
		// Clear cache for this user
		messageCache.delete(author.id);

		// 4. Final Audit Log
		if (auditChannel) {
			await auditChannel.send(`✅ **Automod Action Applied**: User <@${author.id}> has been timed out for 1 day, stripped of admin roles, and assigned the limited access role. All recent messages removed.`);
		}

	} catch (error) {
		console.error("Error in automod violation handler:", error);
		if (auditChannel) {
			await auditChannel.send(`⚠️ Error applying automod action to <@${author.id}>: ${error.message}`).catch(console.error);
		}
	}
}
