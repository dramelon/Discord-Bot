const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Displays a list of commands or information about a specific command.')
        .setIntegrationTypes([0, 1])
		.setContexts([0, 1, 2])
		.addStringOption(option =>
			option.setName('command')
				.setDescription('The command you want to get help for')
				.setRequired(false)),
	async execute(interaction) {
		const commandName = interaction.options.getString('command');
		const { commands } = interaction.client;

		if (!commandName) {
			const helpCommand = commands.get('help');
			const description = helpCommand ? helpCommand.data.description : 'Displays a list of commands.';

			const embed = new EmbedBuilder()
				.setTitle('Help')
				.setDescription(`**/help**\n${description}\n\n**Available Commands**`)
				.setColor(0x5865F2);

			const commandList = commands.map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n');
			embed.addFields({ name: '\u200B', value: commandList || 'No commands available.' });

			return interaction.reply({ embeds: [embed] });
		}

		const command = commands.get(commandName.toLowerCase());

		if (!command) {
			return interaction.reply({ content: 'That command does not exist.', ephemeral: true });
		}

		const embed = new EmbedBuilder()
			.setTitle(`Command: /${command.data.name}`)
			.setDescription(command.data.description)
			.setColor(0x5865F2);

		if (command.data.name === 'ping') {
			embed.addFields(
				{ name: 'Gateway Latency', value: 'The time it takes for the bot to receive a heartbeat acknowledgement from Discord.', inline: false },
				{ name: 'Round-Trip Latency', value: 'The time difference between when the interaction was created and when the initial reply was sent.', inline: false },
				{ name: 'Message Edit Latency', value: 'The time it takes to edit the message with the final ping results.', inline: false },
			);
		} else if (command.data.name === 'clipboard') {
			embed.addFields(
				{ name: 'text', value: 'The text to display on the sign. Supports custom and animated emojis.', inline: false },
			);
		} else if (command.data.name === 'stretch') {
			embed.addFields(
				{ name: 'target', value: '(Optional) The user to stretch. Defaults to your own avatar.', inline: false },
			);
		} else if (command.data.name === 'color') {
			embed.addFields(
				{ name: 'Description', value: 'Manage your custom role color and icon using a simple button interface.', inline: false },
				{ name: 'Usage', value: 'Run `/color` to open the status embed. Click **Customize** to open a modal where you can input a hex color code and a role icon URL, or click **Remove** to delete your custom role.', inline: false },
			);
		} else if (command.data.name === 'leaderboard') {
			embed.addFields(
				{ name: 'Description', value: 'Displays the top 10 users ranked by level and XP.', inline: false },
			);
		}

		await interaction.reply({ embeds: [embed] });
	},
};