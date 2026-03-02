require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
	console.log(`Logged in as ${client.user.tag} to edit message.`);
	try {
		// IDs extracted from the link provided
		const channelId = '1475416103407587460';
		const messageId = '1475417916769046661';

		const channel = await client.channels.fetch(channelId);
		if (!channel) {
			console.error('Channel not found.');
			process.exit(1);
		}

		const message = await channel.messages.fetch(messageId);
		if (!message) {
			console.error('Message not found.');
			process.exit(1);
		}

		// Create 5 fields with name "test" and value "12345"
		const fields = Array.from({ length: 5 }, () => ({ name: 'test', value: '12345' }));

		const embed1 = new EmbedBuilder()
			.setTitle('Embed 1')
			.addFields(fields);

		const embed2 = new EmbedBuilder()
			.setTitle('Embed 2')
			.addFields(fields);

		// Edit the message to contain the two embeds
		await message.edit({ content: null, embeds: [embed1, embed2] });
		console.log(`Successfully edited message ${messageId}`);
	} catch (error) {
		console.error('Failed to edit message:', error);
	} finally {
		client.destroy();
	}
});

client.login(process.env.DISCORD_TOKEN);
