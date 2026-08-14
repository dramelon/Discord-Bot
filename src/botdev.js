const path = require('path');
// Load environment variables from the root .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Set development flags before requiring main modules
process.env.IS_DEV = 'true';
process.env.NODE_ENV = 'development';

// Override the main bot environment variables with DEV counterparts
if (process.env.DISCORD_TOKEN_DEV) {
	process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN_DEV;
}
if (process.env.DISCORD_PUBLIC_KEY_DEV) {
	process.env.DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY_DEV;
}
if (process.env.DISCORD_CLIENT_SECRET_DEV) {
	process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET_DEV;
}
if (process.env.DISCORD_APP_ID_DEV) {
	process.env.CLIENT_ID = process.env.DISCORD_APP_ID_DEV;
}
if (process.env.BOT_DEV_GUILD_ID) {
	process.env.HOMETOWN_GUILD_ID = process.env.BOT_DEV_GUILD_ID;
}

// Ensure the dashboard runs on a different port in development to avoid port conflicts
process.env.PORT = process.env.PORT_DEV || 3001;

const args = process.argv.slice(2);

if (args.includes('--deploy')) {
	console.log('[Dev Bot] Deploying slash commands for the development bot...');
	require('./deploy-commands.js');
} else if (args.includes('--cleanup')) {
	console.log('[Dev Bot] Cleaning up slash commands for the development bot...');
	require('./cleanup-commands.js');
} else {
	console.log('[Dev Bot] Starting bot in development mode...');
	require('./bot.js');
}
