require('dotenv').config();
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');

const commandsList = require('./commands');
const handleRandomReply = require('./randomreply');
const handleLeveling = require('./leveling');
const { logCommand } = require('./logger');
const { startTracking } = require('./commands/qol/status');

const token = process.env.DISCORD_TOKEN;

if (!token) {
	console.error("No token found! Please check your .env file and ensure DISCORD_TOKEN is set.");
	process.exit(1);
}

const client = new Client({ intents: [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.MessageContent,
	GatewayIntentBits.GuildMembers
] });

client.commands = new Collection();

for (const command of commandsList) {
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] A command is missing a required "data" or "execute" property.`);
	}
}

client.on(Events.InteractionCreate, async interaction => {
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	if (interaction.isAutocomplete()) {
		if (command.autocomplete) {
			try {
				await command.autocomplete(interaction);
			} catch (error) {
				console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
			}
		}
	} else if (interaction.isChatInputCommand()) {
		const start = Date.now();
		
		// Capture options strictly for logging purposes
		// We use .data to get the raw structure of arguments provided
		const commandOptions = interaction.options.data || [];

		try {
			await command.execute(interaction);

			// Log successful execution
			logCommand({
				status: 'success',
				command: interaction.commandName,
				user: interaction.user.tag,
				userId: interaction.user.id,
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				params: commandOptions,
				duration: `${Date.now() - start}ms`
			});
		} catch (error) {
			console.error(error);
			
			// Log error execution
			logCommand({
				status: 'error',
				command: interaction.commandName,
				user: interaction.user.tag,
				userId: interaction.user.id,
				params: commandOptions,
				error: error.message,
				stack: error.stack
			});

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
			}
		}
	}
});

client.on(Events.MessageCreate, handleRandomReply);
client.on(Events.MessageCreate, handleLeveling);

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	console.log(`Total slash commands: ${client.commands.size}`);
	console.log(`Command list: ${client.commands.map(cmd => cmd.data.name).join(', ')}`);
});

startTracking();
client.login(token);