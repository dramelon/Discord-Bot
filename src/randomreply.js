module.exports = async (message) => {
	if (message.author.bot) return; // Ignore messages from bots

	if (message.guildId === '1447192381479976993' && /^:3+$/.test(message.content)) {
		await message.channel.send(':3');
	}
};