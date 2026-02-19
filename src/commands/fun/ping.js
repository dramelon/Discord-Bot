const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!')
		.setIntegrationTypes([0, 1])
		.setContexts([0, 1, 2]),
	async execute(interaction) {
		const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, flags: MessageFlags.SuppressNotifications });

		const gatewayPing = interaction.client.ws.ping;
		const roundTripLatency = sent.createdTimestamp - interaction.createdTimestamp;
		const embed = new EmbedBuilder()
			.setTitle('Pong! 🏓')
			.setDescription(`> **Gateway Latency** : ${gatewayPing === -1 ? '<unable to load>' : `${gatewayPing}ms`}\n> **Round-Trip Latency** : ${roundTripLatency}ms\n> **Shard ID**        : #${interaction.guild?.shardId ?? 0}`)
			.setColor(0x5865F2);

		const edited = await interaction.editReply({ content: null, embeds: [embed] });

		const editTimestamp = edited.editedTimestamp ?? Date.now();
		const editLatency = editTimestamp - sent.createdTimestamp;

		embed.setDescription(`> **Gateway Latency** : ${gatewayPing === -1 ? '<unable to load>' : `${gatewayPing}ms`}\n> **Round-Trip Latency** : ${roundTripLatency}ms\n> **Message Edit Latency** : ${editLatency}ms\n> **Shard ID**        : #${interaction.guild?.shardId ?? 0}`);

		await interaction.editReply({ embeds: [embed] });
	},
};