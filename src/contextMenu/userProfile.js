const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require('discord.js');

const BADGE_MAP = {
	Staff: '🛡️ Discord Staff',
	Partner: '🤝 Discord Partner',
	Hypesquad: '🎊 HypeSquad Events',
	BugHunterLevel1: '🐛 Bug Hunter (Green)',
	BugHunterLevel2: '🐛 Bug Hunter (Gold)',
	HypeSquadOnlineHouse1: '🛡️ House Bravery',
	HypeSquadOnlineHouse2: '💎 House Brilliance',
	HypeSquadOnlineHouse3: '⚖️ House Balance',
	PremiumEarlySupporter: '🌟 Early Supporter',
	TeamPseudoUser: '👥 Team User',
	VerifiedBot: '🤖 Verified Bot',
	VerifiedDeveloper: '🛠️ Early Verified Bot Developer',
	CertifiedModerator: '🛡️ Certified Moderator',
	BotHTTPInteractions: '🌐 HTTP Bot',
	ActiveDeveloper: '💻 Active Developer',
};

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('User Profile Info')
		.setType(ApplicationCommandType.User)
		.setIntegrationTypes([0, 1]) // Guild and User installs
		.setContexts([0, 1, 2]), // Guilds, Bot DMs, Private DMs
	async execute(interaction) {
		const targetId = interaction.targetId;

		// Defer reply as we are going to fetch data from the Discord API
		await interaction.deferReply({ ephemeral: true });

		try {
			// Try to force fetch user to retrieve banner and accent color, falling back to interaction.targetUser if it fails
			let targetUser = interaction.targetUser;
			try {
				if (targetId) {
					targetUser = await interaction.client.users.fetch(targetId, { force: true });
				}
			} catch (fetchError) {
				console.warn(`[WARNING] Could not force fetch user ${targetId}, using interaction target:`, fetchError.message);
			}

			if (!targetUser) {
				return interaction.editReply({ content: '❌ Could not find or fetch target user details.' });
			}

			// 1. Calculate Profile Completeness Index (PCI)
			const hasCustomAvatar = targetUser.avatar !== null;
			const hasCustomBanner = targetUser.banner !== null;
			const hasAccentColor = targetUser.accentColor !== null || targetUser.hexAccentColor !== null;
			const hasCustomDisplayName = targetUser.globalName !== null && targetUser.globalName !== targetUser.username;

			let completeness = 0;
			const breakdown = [];

			if (hasCustomAvatar) {
				completeness += 30;
				breakdown.push('✅ Custom Avatar (+30%)');
			} else {
				breakdown.push('❌ Default Avatar (+0%)');
			}

			if (hasCustomBanner) {
				completeness += 35;
				breakdown.push('✅ Custom Banner (+35%)');
			} else {
				breakdown.push('❌ No Banner (+0%)');
			}

			if (hasAccentColor) {
				completeness += 15;
				breakdown.push('✅ Custom Accent Color (+15%)');
			} else {
				breakdown.push('❌ No Accent Color (+0%)');
			}

			if (hasCustomDisplayName) {
				completeness += 20;
				breakdown.push('✅ Unique Display Name (+20%)');
			} else {
				breakdown.push('❌ Username as Display Name (+0%)');
			}

			const filledSegments = Math.round(completeness / 10);
			const bar = '🟩'.repeat(filledSegments) + '⬜'.repeat(10 - filledSegments);

			// 2. Suspicion & Bot Analysis
			const accountAgeDays = Math.floor((Date.now() - targetUser.createdTimestamp) / (1000 * 60 * 60 * 24));
			let suspicionLevel = '🟢 None / Safe';
			let suspicionReason = 'Regular user account patterns detected.';

			if (targetUser.bot) {
				suspicionLevel = '🤖 Bot (Official)';
				suspicionReason = 'This is an officially registered Discord bot application.';
			} else if (targetUser.system) {
				suspicionLevel = '🛡️ System (Official)';
				suspicionReason = 'This is an official Discord system account.';
			} else if (accountAgeDays < 7) {
				suspicionLevel = '🔴 High Risk';
				suspicionReason = 'Extremely new account! Created less than a week ago.';
			} else if (accountAgeDays < 30) {
				suspicionLevel = '🟡 Medium Risk';
				suspicionReason = 'Relatively new account. Created less than 30 days ago.';
			} else if (completeness <= 30) {
				suspicionLevel = '🟡 Medium Risk';
				suspicionReason = 'Low profile completeness (default avatar, no banner, no display name differences). Common setup for spam/throwaway bots.';
			} else if (accountAgeDays < 90 && completeness <= 50) {
				suspicionLevel = '🟡 Medium Risk';
				suspicionReason = 'Young account (< 90 days) with low profile completeness details.';
			}

			// Determine embed color based on suspicion level
			let embedColor = 0x5865F2; // Blurple
			if (targetUser.bot || targetUser.system) {
				embedColor = 0x57F287; // Green
			} else if (suspicionLevel.includes('High')) {
				embedColor = 0xED4245; // Red
			} else if (suspicionLevel.includes('Medium')) {
				embedColor = 0xFEE75C; // Yellow
			} else if (targetUser.hexAccentColor) {
				// Convert hex color to integer
				embedColor = parseInt(targetUser.hexAccentColor.replace('#', ''), 16);
			}

			// Get public badges
			const badgesArray = targetUser.publicFlags ? targetUser.publicFlags.toArray() : [];
			const badgesList = badgesArray.length > 0
				? badgesArray.map(flag => BADGE_MAP[flag] || flag).join('\n')
				: 'None';

			// Create basic embed details
			const embed = new EmbedBuilder()
				.setTitle(`Profile Check: ${targetUser.tag}`)
				.setThumbnail(targetUser.displayAvatarURL({ size: 512, forceStatic: false }))
				.setColor(embedColor)
				.addFields(
					{
						name: '👤 Identity Info',
						value: `**Mention:** <@${targetUser.id}>\n**ID:** \`${targetUser.id}\`\n**Display Name:** \`${targetUser.globalName || 'None'}\`\n**Username:** \`${targetUser.username}\``,
						inline: false,
					},
					{
						name: '🕒 Account Creation',
						value: `**Created:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>\n**Age:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R> (${accountAgeDays} days old)`,
						inline: false,
					},
					{
						name: '📊 Profile Completeness',
						value: `**Score:** \`${completeness}%\`\n${bar}\n\n**Breakdown:**\n${breakdown.join('\n')}`,
						inline: false,
					},
					{
						name: '⚠️ Bot & Suspicion Check',
						value: `**Official Bot:** \`${targetUser.bot ? 'Yes' : 'No'}\`\n**System Account:** \`${targetUser.system ? 'Yes' : 'No'}\`\n**Risk Rating:** ${suspicionLevel}\n**Reason:** *${suspicionReason}*`,
						inline: false,
					},
					{
						name: '🏅 Public Badges',
						value: badgesList,
						inline: false,
					},
					{
						name: '🔑 Asset Hashes',
						value: `**Avatar:** \`${targetUser.avatar || 'Default/None'}\`\n**Banner:** \`${targetUser.banner || 'None'}\`\n**Accent Color:** \`${targetUser.hexAccentColor || 'None'}\``,
						inline: false,
					}
				)
				.setFooter({ text: `Checked by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ size: 128 }) })
				.setTimestamp();

			// Add banner image if available
			if (targetUser.banner) {
				const bannerUrl = targetUser.bannerURL({ size: 1024, forceStatic: false });
				if (bannerUrl) {
					embed.setImage(bannerUrl);
				}
			}

			// 3. Guild specific info if interaction occurs in a guild context and member exists
			let member = interaction.targetMember;
			if (!member && interaction.guild) {
				member = await interaction.guild.members.fetch(targetId).catch(() => null);
			}

			if (member) {
				const roles = member.roles.cache
					.filter(role => role.id !== interaction.guildId) // Filter out @everyone
					.map(role => role.toString());

				const rolesDisplay = roles.length > 0
					? (roles.length > 10 ? `${roles.slice(0, 10).join(', ')} ...and ${roles.length - 10} more` : roles.join(', '))
					: 'None';

				embed.addFields({
					name: `🏰 Server Member Info (${interaction.guild.name})`,
					value: `**Nickname:** \`${member.nickname || 'None'}\`\n**Joined Guild:** <t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)\n**Highest Role:** ${member.roles.highest.name !== '@everyone' ? member.roles.highest.toString() : 'None'}\n**Total Roles:** \`${roles.length}\`\n**Roles:** ${rolesDisplay}`,
					inline: false,
				});

				// If member has guild avatar
				if (member.avatar) {
					embed.setDescription(`*Note: User has a server-specific avatar.*`);
				}
			}

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			console.error('Error in User Profile Info context menu:', error);
			await interaction.editReply({ content: `❌ An error occurred while retrieving user details: ${error.message}` });
		}
	},
};
