require('dotenv').config();
const { Client, Collection, Events, GatewayIntentBits, Partials } = require('discord.js');

const commandsList = require('./commands');
const handleRandomReply = require('./randomreply');
const { levelSystemListener } = require('./leveling');
const { logCommand } = require('./logger');
const { startTracking } = require('./commands/qol/status');
const memberAdd = require('./events/guild/memberAdd');
const memberRemove = require('./events/guild/memberRemove');
const tempVoiceStateUpdate = require('./events/guild/voiceStateUpdate');
const automod = require('./utils/automod');
const { handleMessage, handleReaction, handleVoiceState, startActivityTracking } = require('./utils/socialactivity');
const { handleAchievementMessage } = require('./utils/achievementTracker');

const token = process.env.DISCORD_TOKEN;

if (!token) {
	console.error("No token found! Please check your .env file and ensure DISCORD_TOKEN is set.");
	process.exit(1);
}

const client = new Client({ 
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates
	],
	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction,
		Partials.User
	]
});

client.commands = new Collection();

for (const command of commandsList) {
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] A command is missing a required "data" or "execute" property.`);
	}
}

client.on(Events.InteractionCreate, async interaction => {
	// Only process ChatInputCommand and Autocomplete interactions here.
	if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;

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
		const commandOptions = interaction.options.data || [];

		try {
			await command.execute(interaction);

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

// Handle custom interactions (Buttons, Modals)
client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isButton()) {
		for (const [name, command] of client.commands) {
			if (interaction.customId.startsWith(name) || (name === 'verification' && interaction.customId.startsWith('verify'))) {
				if (command.handleButton) {
					try {
						await command.handleButton(interaction);
					} catch (error) {
						console.error(`Error handling button in command ${name}:`, error);
					}
					return;
				}
			}
		}
	}

	if (interaction.isModalSubmit()) {
		for (const [name, command] of client.commands) {
			if (interaction.customId.startsWith(name) || (name === 'verification' && interaction.customId.startsWith('verify'))) {
				if (command.handleModal) {
					try {
						await command.handleModal(interaction);
					} catch (error) {
						console.error(`Error handling modal in command ${name}:`, error);
					}
					return;
				}
			}
		}
	}
});

client.on(Events.MessageCreate, handleRandomReply);
client.on(Events.MessageCreate, levelSystemListener);
client.on(Events.MessageCreate, automod);
client.on(Events.MessageCreate, handleMessage);
client.on(Events.MessageCreate, handleAchievementMessage);
client.on(Events.MessageReactionAdd, async (reaction, user) => {
	if (reaction.partial) {
		try {
			await reaction.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the message:', error);
			return;
		}
	}

	// Delete level-up notifications when user reacts with ❌
	if (reaction.emoji.name === '❌' && reaction.message.author?.id === client.user?.id) {
		const embed = reaction.message.embeds?.[0];
		if (embed && embed.title === '🎊 Level Up!') {
			const match = embed.description?.match(/<@!?(\d+)>/);
			if (match && match[1] === user.id) {
				await reaction.message.delete().catch(() => {});
				return;
			}
		}
	}

	handleReaction(reaction, user);
});
client.on(Events.VoiceStateUpdate, handleVoiceState);
client.on(tempVoiceStateUpdate.name, (...args) => tempVoiceStateUpdate.execute(...args));
client.on(memberAdd.name, (...args) => memberAdd.execute(...args));
client.on(memberRemove.name, (...args) => memberRemove.execute(...args));

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	console.log(`Total slash commands: ${client.commands.size}`);
	console.log(`Command list: ${client.commands.map(cmd => cmd.data.name).join(', ')}`);
	console.log(`Online`);
	startActivityTracking(readyClient);

	const reminderCommand = client.commands.get('reminder');
	if (reminderCommand && reminderCommand.startScheduler) {
		reminderCommand.startScheduler(readyClient);
	}
});

startTracking();
client.login(token);