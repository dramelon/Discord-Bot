require('dotenv').config();
const { REST, Routes } = require('discord.js');

const { CLIENT_ID, GUILD_ID, DISCORD_TOKEN } = process.env;

if (!CLIENT_ID || !GUILD_ID || !DISCORD_TOKEN) {
    console.error('Error: Make sure CLIENT_ID, GUILD_ID, and DISCORD_TOKEN are in your .env file for cleanup.');
    process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

const cleanup = async () => {
    try {
        console.log('Starting to clear application commands.');

        // Clear guild-specific commands
        console.log(`--> Clearing commands for guild: ${GUILD_ID}`);
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: [] },
        );
        console.log('--> Successfully cleared guild commands.');

        // Clear global commands
        console.log('--> Clearing global commands.');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
        console.log('--> Successfully cleared global commands.');

        console.log('Finished clearing all application commands.');
    } catch (error) {
        console.error('An error occurred during command cleanup:', error);
    }
};

cleanup();