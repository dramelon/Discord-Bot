const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const stretch = require('../commands/fun/stretch.js');

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Stretch Message')
		.setType(ApplicationCommandType.Message)
		.setIntegrationTypes([0, 1]) // Guild and User installs
		.setContexts([0, 1, 2]), // Guilds, Bot DMs, Private DMs
	async execute(interaction) {
		const message = interaction.targetMessage;
		if (!message) {
			return interaction.reply({ content: '❌ Could not find target message.', ephemeral: true });
		}

		const source = stretch.extractImageSourceFromMessage(message);
		if (!source) {
			return interaction.reply({ content: '❌ Message does not contain any attachments, emojis, or stickers to stretch.', ephemeral: true });
		}

		await interaction.deferReply();
		await stretch.generateStretchFromSource(interaction, source);
	},
};
