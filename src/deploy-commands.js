require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commandsList = require('./commands');

const commands = [];

for (const command of commandsList) {
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	} else {
		console.log(`[WARNING] A command is missing "data" or "execute".`);
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy your commands!
(async () => {
	try {
		// GUILD_ID is no longer needed for global command deployment
		if (!process.env.CLIENT_ID) {
			console.error('Error: CLIENT_ID is missing in your .env file.');
			return;
		}

		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// Routes.applicationCommands updates commands globally (can take up to an hour)
		const data = await rest.put(
			Routes.applicationCommands(process.env.CLIENT_ID),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();