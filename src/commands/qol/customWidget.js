const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('customwidget')
		.setDescription('Configure and sync your custom statistics widget on your Discord profile.')
		.setIntegrationTypes([0, 1]) // Guild and User installs
		.setContexts([0, 1, 2]), // Guilds, Bot DMs, Private DMs
	async execute(interaction) {
		const configUrl = 'https://bot.furred.site/my_config';
		const installUrl = process.env.OAUTH2_OPENID_SDK || 'https://discord.com/oauth2/authorize?client_id=873210035071750175&response_type=code&redirect_uri=https%3A%2F%2Fbot.furred.site%2Fapi%2Fauth%2Fcallback&scope=openid+sdk.social_layer';

		const embed = new EmbedBuilder()
			.setTitle('🆔 Custom Profile & Connection Widget')
			.setDescription(
				'Showcase your live bot statistics directly on your Discord profile using **Discord Linked Roles** and the new **Social Layer SDK** widget!\n\n' +
				'We support two types of widgets:\n' +
				'1️⃣ **Standard Role Connections:** A verified connection badge showing stats (Level, XP, etc.) under your connections list.\n' +
				'2️⃣ **Profile Board Widget (Social Layer):** An experimental profile card widget displaying a rich layout of your live RPG status.'
			)
			.addFields(
				{
					name: '📋 What can you display?',
					value: '🔹 **Bot Level:** Your RPG leveling system level.\n' +
						'🔹 **Total XP:** Your total experience points earned.\n' +
						'🔹 **Achievements:** Count of milestones you have unlocked.\n' +
						'🔹 **Loyalty Days:** Days since you joined the home server.\n' +
						'🔹 **Developer Badge:** Verified bot developer status flag.',
					inline: false
				},
				{
					name: '🚀 Setup Guide',
					value: '🔹 **For standard Role Connections:**\n' +
						'1️⃣ Click **Configure Widget Dashboard** below to open options.\n' +
						'2️⃣ Click **Save & Sync with Discord** on the dashboard.\n' +
						'3️⃣ Open Discord **User Settings > Connections**, find the bot, and enable **Display on profile**.\n\n' +
						'🔹 **For the Profile Board Widget (Social Layer):**\n' +
						'1️⃣ Click the **Authorize Social SDK** button below to grant social scopes.\n' +
						'2️⃣ Sync your settings on the dashboard to push live widget updates.\n' +
						'3️⃣ *Note:* Profile Board widgets are currently experimental in the Discord app!',
					inline: false
				}
			)
			.setColor(0x6366F1) // Premium Indigo color matching dashboard theme
			.setFooter({ text: 'Powered by furred.site', iconURL: interaction.client.user.displayAvatarURL({ size: 128 }) })
			.setTimestamp();

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setLabel('Configure Widget Dashboard')
					.setStyle(ButtonStyle.Link)
					.setURL(configUrl)
					.setEmoji('⚙️'),
				new ButtonBuilder()
					.setLabel('Authorize Social SDK')
					.setStyle(ButtonStyle.Link)
					.setURL(installUrl)
					.setEmoji('🌐'),
				new ButtonBuilder()
					.setLabel('Visit furred.site')
					.setStyle(ButtonStyle.Link)
					.setURL('https://furred.site')
			);

		await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
	},
};
