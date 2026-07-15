require('dotenv').config();
const logger = require('./utils/customLogger');
console.log = logger.info;
console.info = logger.info;
console.warn = logger.warn;
console.error = logger.error;
const { Client, Collection, Events, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');

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
const { handleAchievementMessage, syncAchievements, TRACKING_CHANNEL_ID } = require('./utils/achievementTracker');
const { handlePresenceMessage } = require('./utils/presenceTracker');
const { isAdmin } = require('./utils/adminCheck');
const { startStatusChannelUpdater } = require('./utils/statusChannelUpdater');
const { startDashboard } = require('./dashboard');
const apiTracker = require('./utils/apiTracker');

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

apiTracker.initDiscordClient(client);

const LOG_CHANNEL_ID = '1495616892369506374';

async function logErrorToDiscord(error, type = 'Error') {
	// Always print to console
	console.error(`[${type}]`, error);

	try {
		if (!client.token || !client.isReady()) {
			return;
		}

		const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
		if (!channel || !channel.isTextBased()) {
			return;
		}

		// Prevent infinite loops if logging itself fails
		if (error && error.stack && error.stack.includes(LOG_CHANNEL_ID)) {
			return;
		}

		const errorMessage = error?.message || error?.toString() || 'Unknown error';
		const errorStack = error?.stack;

		const content = `⚠️ **[Bot ${type}]** ${errorMessage}`;
		const options = { content };

		if (errorStack) {
			const attachment = new AttachmentBuilder(Buffer.from(errorStack, 'utf-8'), { name: 'traceback.txt' });
			options.files = [attachment];
		}

		await channel.send(options);
	} catch (logErr) {
		console.error('Failed to send error log to Discord:', logErr);
	}
}

function safeEvent(handler, name) {
	return async (...args) => {
		try {
			await handler(...args);
		} catch (error) {
			logErrorToDiscord(error, `Event: ${name}`);
		}
	};
}

// Global process error handling to prevent bot crash
process.on('unhandledRejection', (reason) => {
	logErrorToDiscord(reason, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
	logErrorToDiscord(error, 'Uncaught Exception');
});

client.on(Events.Error, (error) => {
	logErrorToDiscord(error, 'Client Error');
});

client.on(Events.Warn, (warning) => {
	logErrorToDiscord(new Error(warning), 'Warning');
});

client.commands = new Collection();

for (const command of commandsList) {
	if (command && 'data' in command && 'execute' in command) {
		console.log(`[DEBUG] Registering command: "${command.data.name}"`);
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] A command is missing a required "data" or "execute" property. Details:`, command);
	}
}

client.on(Events.InteractionCreate, async interaction => {
	// Only process ChatInputCommand, ContextMenuCommand, and Autocomplete interactions here.
	if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand() && !interaction.isAutocomplete()) return;

	const commandName = interaction.commandName;
	console.log(`[DEBUG] Received interaction for command: "${commandName}" (Type: ${interaction.type})`);
	const command = interaction.client.commands.get(commandName);

	if (!command) {
		console.error(`No command matching "${commandName}" was found. Registered commands: ${Array.from(interaction.client.commands.keys()).join(', ')}`);
		return;
	}

	if (interaction.isAutocomplete()) {
		if (command.autocomplete) {
			try {
				await command.autocomplete(interaction);
			} catch (error) {
				logErrorToDiscord(error, `Autocomplete: /${interaction.commandName}`);
			}
		}
	} else if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
		const start = Date.now();
		const commandOptions = interaction.isChatInputCommand() ? (interaction.options.data || []) : [];

		try {
			await command.execute(interaction);
			console.log(`[Interaction] Command /${interaction.commandName} executed by ${interaction.user.tag} in guild ${interaction.guildId || 'DM'} successfully.`);

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
			const commandTypeStr = interaction.isChatInputCommand() ? 'Command' : 'Context Menu';
			logErrorToDiscord(error, `${commandTypeStr}: ${interaction.commandName}`);
			console.error(`[Interaction] Command /${interaction.commandName} executed by ${interaction.user.tag} failed: ${error.message}`);
			
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
						logErrorToDiscord(error, `Button: ${interaction.customId} in ${name}`);
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
						logErrorToDiscord(error, `Modal: ${interaction.customId} in ${name}`);
					}
					return;
				}
			}
		}
	}

	if (interaction.isAnySelectMenu()) {
		for (const [name, command] of client.commands) {
			if (interaction.customId.startsWith(name)) {
				if (command.handleSelectMenu) {
					try {
						await command.handleSelectMenu(interaction);
					} catch (error) {
						logErrorToDiscord(error, `SelectMenu: ${interaction.customId} in ${name}`);
					}
					return;
				}
			}
		}
	}
});

client.on(Events.MessageCreate, safeEvent(handleRandomReply, 'MessageCreate (handleRandomReply)'));
client.on(Events.MessageCreate, safeEvent(levelSystemListener, 'MessageCreate (levelSystemListener)'));
client.on(Events.MessageCreate, safeEvent(automod, 'MessageCreate (automod)'));
client.on(Events.MessageCreate, safeEvent(handleMessage, 'MessageCreate (handleMessage)'));
client.on(Events.MessageCreate, safeEvent(handleAchievementMessage, 'MessageCreate (handleAchievementMessage)'));
client.on(Events.MessageCreate, safeEvent(handlePresenceMessage, 'MessageCreate (handlePresenceMessage)'));
client.on(Events.MessageCreate, safeEvent(async (message) => {
	if (message.content !== '!sync') return;
	if (message.channelId !== TRACKING_CHANNEL_ID) return;
	if (!isAdmin(message.author)) {
		await message.reply('❌ You do not have permission to use this command.').catch(() => {});
		return;
	}

	try {
		const reply = await message.reply('⏳ Syncing achievements from the last 3 days...');
		const result = await syncAchievements(message.client);
		await reply.edit(`✅ Sync complete! Added **${result.addedCount}** new achievements for **${result.playersCount}** players.`);
	} catch (error) {
		console.error('[Sync] Error during sync:', error);
		await message.reply(`❌ Sync failed: ${error.message}`).catch(() => {});
	}
}, 'MessageCreate (syncAchievements)'));
client.on(Events.MessageReactionAdd, async (reaction, user) => {
	if (reaction.partial) {
		try {
			await reaction.fetch();
		} catch (error) {
			logErrorToDiscord(error, 'Message Reaction Fetch');
			return;
		}
	}

	// Delete level-up notifications when user reacts with ❌
	try {
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

		await handleReaction(reaction, user);
	} catch (error) {
		logErrorToDiscord(error, 'MessageReactionAdd (Reaction/Delete/Handle)');
	}
});
client.on(Events.VoiceStateUpdate, safeEvent(handleVoiceState, 'VoiceStateUpdate (handleVoiceState)'));
client.on(tempVoiceStateUpdate.name, safeEvent(tempVoiceStateUpdate.execute, `VoiceStateUpdate (${tempVoiceStateUpdate.name})`));
client.on(memberAdd.name, safeEvent(memberAdd.execute, `GuildMemberAdd (${memberAdd.name})`));
client.on(memberRemove.name, safeEvent(memberRemove.execute, `GuildMemberRemove (${memberRemove.name})`));

client.once(Events.ClientReady, safeEvent(readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	console.log(`Total slash commands: ${client.commands.size}`);
	console.log(`Command list: ${client.commands.map(cmd => cmd.data.name).join(', ')}`);
	console.log(`Online`);
	startActivityTracking(readyClient);

	const reminderCommand = client.commands.get('reminder');
	if (reminderCommand && reminderCommand.startScheduler) {
		reminderCommand.startScheduler(readyClient);
	}

	startStatusChannelUpdater(readyClient);
}, 'ClientReady'));

try {
	startTracking();
} catch (error) {
	logErrorToDiscord(error, 'Initialization (startTracking)');
}

try {
	startDashboard(client);
} catch (error) {
	logErrorToDiscord(error, 'Initialization (startDashboard)');
}

client.on(Events.GuildCreate, (guild) => {
	console.log(`[Guild] Bot was invited/added to guild: ${guild.name} (ID: ${guild.id}) with ${guild.memberCount} members.`);
});

client.on(Events.GuildDelete, (guild) => {
	console.log(`[Guild] Bot was removed from guild: ${guild.name} (ID: ${guild.id}).`);
});

client.login(token);