const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const clipboard = require('../commands/fun/clipboard.js');

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Put on Clipboard')
		.setType(ApplicationCommandType.Message)
		.setIntegrationTypes([0, 1]) // Guild and User installs
		.setContexts([0, 1, 2]), // Guilds, Bot DMs, Private DMs
	async execute(interaction) {
		const message = interaction.targetMessage;
		if (!message) {
			return interaction.reply({ content: '❌ Could not find target message.', ephemeral: true });
		}

		const text = message.content;
		if (!text || text.trim().length === 0) {
			return interaction.reply({ content: '❌ Message does not have any text content to put on the clipboard.', ephemeral: true });
		}

		await interaction.deferReply();
		await clipboard.generateClipboardImage(interaction, text);
	},
};
