require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
	console.log(`Logged in as ${client.user.tag} to edit message.`);
	try {
		// IDs extracted from the link provided: https://discord.com/channels/1447192381479976993/1483501813855686747/1483508317874683945
		const channelId = '1483501813855686747';
		const messageId = '1483508317874683945';

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

		// Define the new Components V2 layout
		const components = [
			{
				type: 17, // Container
				components: [
					{
						type: 9, // Section
						components: [
							{
								type: 10, // Text Display
								content: "## Verification Required\nTo access the rest of the server, please click the button below to verify yourself with a simple math question."
							}
						],
						accessory: {
							type: 11, // Thumbnail
							media: {
								url: "https://cdn-icons-png.flaticon.com/512/1041/1041892.png" // Clean security lock icon
							},
							description: "Security Lock"
						}
					},
					{
						type: 1, // Action Row
						components: [
							{
								type: 2, // Button
								style: 1, // Primary (Blurple)
								label: "Verify",
								custom_id: "verify_button"
							}
						]
					}
				]
			}
		];

		// Edit the message using the Components V2 flag (32768)
		await message.edit({
			content: null,
			embeds: [],
			components: components,
			flags: 32768
		});
		console.log(`Successfully edited message ${messageId} to V2 Components.`);
	} catch (error) {
		console.error('Failed to edit message:', error);
	} finally {
		client.destroy();
	}
});

client.login(process.env.DISCORD_TOKEN);

