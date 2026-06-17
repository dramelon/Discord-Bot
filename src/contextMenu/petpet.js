const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const petpet = require('../commands/fun/petpet.js');

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Petpet User')
		.setType(ApplicationCommandType.User)
		.setIntegrationTypes([0, 1]) // Guild and User installs
		.setContexts([0, 1, 2]), // Guilds, Bot DMs, Private DMs
	async execute(interaction) {
		const targetUser = interaction.targetUser;
		const targetMember = interaction.targetMember;

		if (!targetUser) {
			return interaction.reply({ content: '❌ Could not find target user.', ephemeral: true });
		}

		await interaction.deferReply();

		// Use server avatar if available, otherwise fallback to main profile avatar
		const source = targetMember
			? targetMember.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })
			: targetUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });

		const notificationText = `${interaction.user} is petting ${targetUser}!`;

		// Pass interaction, source, speed=1, squeeze=1, size=224 (medium), and notificationText
		await petpet.generatePetpetFromSource(interaction, source, 1, 1, 224, notificationText);
	},
};
