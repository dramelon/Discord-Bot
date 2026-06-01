const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const { HOMETOWN_GUILD_ID, HOMETOWN_MUTED_ROLE_ID, HOMETOWN_ADMIN_ROLE_ID, OWNER_PERM, NO_AUTOMOD } = process.env;

// Constants for IDs
const AUDIT_CHANNEL_ID = '1470768247208149146';

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

// Invite cache to avoid duplicate lookup requests
const inviteCache = new Map();

async function getInviteGuildId(client, code) {
	if (inviteCache.has(code)) {
		return inviteCache.get(code);
	}
	const invite = await client.fetchInvite(code).catch(() => null);
	const guildId = invite ? (invite.guildId || invite.guild?.id) : null;
	inviteCache.set(code, guildId);
	return guildId;
}

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
	if (message.guildId !== HOMETOWN_GUILD_ID) return;
	if (!message.guild || !message.member) return;

	const userId = message.author.id;

	// Ignore if user is in OWNER_PERM or NO_AUTOMOD list
	const ignoredUsers = [
		...(OWNER_PERM || '').split(','),
		...(NO_AUTOMOD || '').split(',')
	].map(id => id.trim()).filter(Boolean);

	if (ignoredUsers.includes(userId)) return;
	const content = (message.content || '').toLowerCase();
	const now = Date.now();

	// Parse invite codes
	const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/([a-zA-Z0-9\-]+)/gi;
	const inviteCodes = [];
	let match;
	while ((match = inviteRegex.exec(message.content || '')) !== null) {
		inviteCodes.push(match[1]);
	}

	const externalInviteCodes = [];
	for (const code of inviteCodes) {
		const inviteGuildId = await getInviteGuildId(message.client, code);
		if (!inviteGuildId || inviteGuildId !== HOMETOWN_GUILD_ID) {
			externalInviteCodes.push(code);
		}
	}

	const hasLink = /https?:\/\/[^\s]+/i.test(message.content || '');
	const hasAttachment = message.attachments && message.attachments.size > 0;
	const hasLinkOrAttachment = hasLink || hasAttachment;

	// Check scam match for current message
	const matchesScamPattern = SCAM_PATTERNS.Links.some(pattern => pattern.test(content)) || 
	                           SCAM_PATTERNS.Phrases.some(phrase => content.includes(phrase));

	// Track the current message
	if (!messageCache.has(userId)) messageCache.set(userId, []);
	const userHistory = messageCache.get(userId);
	userHistory.push({
		content: message.content,
		timestamp: now,
		channelId: message.channelId,
		messageId: message.id,
		hasLinkOrAttachment,
		hasScamTrigger: matchesScamPattern && !hasLinkOrAttachment, // text-only scam match
		attachmentNames: message.attachments ? message.attachments.map(a => a.name).join(',') : '',
		externalInviteCodes
	});
	pruneCache(userId);

	let reason = null;

	// 1. Scam Link/Phrase Detection (with false-positive protection)
	if (matchesScamPattern) {
		if (hasLinkOrAttachment) {
			reason = "Suspicious scam/virus link or attachment detected.";
		} else {
			// It's a text-only scam trigger (e.g. discussing "free nitro" as a joke)
			// We only flag if they post it to 5 or more different channels within 30 seconds
			const scamTextMsgs = userHistory.filter(m => m.hasScamTrigger);
			const uniqueScamChannels = new Set(scamTextMsgs.map(m => m.channelId));
			if (uniqueScamChannels.size >= 5) {
				reason = "Scam phrases sent to 5 or more different channels within 30 seconds.";
			}
		}
	}

	// 2. Delayed scam check: if they sent a text-only scam match earlier, and now they post a link/attachment
	if (!reason && hasLinkOrAttachment) {
		// Find any recent text-only scam trigger message in the last 30s
		const hadRecentScamText = userHistory.some(m => m.hasScamTrigger && (now - m.timestamp < 30000));
		if (hadRecentScamText) {
			reason = "Scam phrase followed by a link or attachment.";
		}
	}

	// 3. External Invite Link Rate-limiting
	if (!reason && externalInviteCodes.length > 0) {
		const recentExternalInviteMsgs = userHistory.filter(m => m.externalInviteCodes && m.externalInviteCodes.length > 0);
		for (const code of externalInviteCodes) {
			const matchCount = recentExternalInviteMsgs.filter(m => m.externalInviteCodes.includes(code)).length;
			const uniqueChannels = new Set(
				recentExternalInviteMsgs
					.filter(m => m.externalInviteCodes.includes(code))
					.map(m => m.channelId)
			);
			if (matchCount > 3) {
				reason = `Spamming invite link (${code}) more than 3 times in 30 seconds.`;
				break;
			}
			if (uniqueChannels.size > 3) {
				reason = `Spamming invite link (${code}) across more than 3 channels in 30 seconds.`;
				break;
			}
		}
	}

	// 4. Spam Detection
	if (!reason) {
		// Rule A: Same message (text or attachment) across 5 or more channels in 30 seconds
		const sameMessages = userHistory.filter(m => {
			if (m.content && m.content === message.content) return true;
			const currentAttachments = message.attachments ? message.attachments.map(a => a.name).join(',') : '';
			if (m.attachmentNames && m.attachmentNames === currentAttachments && m.attachmentNames !== '') return true;
			return false;
		});
		const uniqueChannelsForSameMessage = new Set(sameMessages.map(m => m.channelId));
		if (uniqueChannelsForSameMessage.size >= 5) {
			reason = "Spamming the same content/attachment across 5 or more channels.";
		}
	}

	if (!reason) {
		// Rule B: Sending different messages/context under 5 seconds (rapid burst)
		const recent5s = userHistory.filter(m => now - m.timestamp < 5000);
		if (recent5s.length >= 5) {
			reason = "Rapid spamming of messages (5 or more messages in under 5 seconds).";
		}
	}

	// 5. Ping/Everyone Mention Spam Detection and legacy spam check
	if (!reason) {
		const recentMessages = userHistory.filter(m => now - m.timestamp < SPAM_WINDOW);
		
		// Legacy check: duplicate content count >= 3 across >= 2 channels in 10s
		const uniqueChannels = new Set(recentMessages.map(m => m.channelId));
		const duplicateContentCount = recentMessages.filter(m => m.content === message.content).length;

		if (duplicateContentCount >= 3 && uniqueChannels.size >= 2) {
			reason = "Spamming the same message across multiple channels.";
		}

		if (!reason) {
			// Check for @everyone or @here pings
			const pingCount = ((message.content || '').match(/@(everyone|here)/g) || []).length;
			const totalRecentPings = recentMessages.reduce((sum, m) => sum + ((m.content || '').match(/@(everyone|here)/g) || []).length, 0);

			// Trigger if multiple pings in 10s or if unauthorized
			if (totalRecentPings >= 3 || (pingCount > 0 && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone))) {
				reason = "Excessive or unauthorized @everyone/@here pings detected.";
			}
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
		const canPunish = member.moderatable && member.manageable;

		if (canPunish) {
			// 1-day timeout
			await member.timeout(24 * 60 * 60 * 1000, `Automod: ${reason}`).catch(console.error);

			// Add restrictive role
			const mutedRole = guild.roles.cache.get(HOMETOWN_MUTED_ROLE_ID);
			if (mutedRole) await member.roles.add(mutedRole).catch(console.error);

			// Remove admin role if present
			if (member.roles.cache.has(HOMETOWN_ADMIN_ROLE_ID)) {
				await member.roles.remove(HOMETOWN_ADMIN_ROLE_ID).catch(console.error);
			}
		} else if (auditChannel) {
			await auditChannel.send(`⚠️ **Warning**: Skipped timeout and role modifications for <@${author.id}> (Bot lacks permissions or user has higher role).`);
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
			if (canPunish) {
				await auditChannel.send(`✅ **Automod Action Applied**: User <@${author.id}> has been timed out for 1 day, stripped of admin roles, and assigned the limited access role. All recent messages removed.`);
			} else {
				await auditChannel.send(`✅ **Automod Cleanup Applied**: All recent messages from <@${author.id}> were removed.`);
			}
		}

	} catch (error) {
		console.error("Error in automod violation handler:", error);
		if (auditChannel) {
			await auditChannel.send(`⚠️ Error applying automod action to <@${author.id}>: ${error.message}`).catch(console.error);
		}
	}
}
