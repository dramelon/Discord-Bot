const { HOMETOWN_GUILD_ID } = process.env;

module.exports = async (message) => {
	if (message.author.bot) return; // Ignore messages from bots

	// Only process messages in the specified guild
	if (message.guildId !== HOMETOWN_GUILD_ID) return;

	const content = message.content;

	// 1. Handle exact matching triggers (owo, uwu, etc.)
	const exactMatchReplies = {
		'owo': 'uwu',
		'uwu': 'owo',
		'OwO': 'UwU',
		'UwU': 'OwO',
		'>w<': '>w<'
	};

	if (exactMatchReplies[content]) {
		await message.channel.send(exactMatchReplies[content]);
		return;
	}

	// 2. Handle pattern matching triggers (:3, ;3, >:3)
	// These allow multiple '3's but reply with a single '3'
	const matches = content.match(/^(:3+|;3+|>:3+)$/);
	if (matches) {
		const prefix = matches[1].replace(/3+$/, ''); // Extract prefix by removing all '3's
		await message.channel.send(`${prefix}3`);
		return;
	}

	// 3. Handle sticker replies
	const targetStickers = ['1490227468559192185', '1490228097113391164']; // gust, COD_KLOM
	const stickerMatch = message.stickers.find(s => targetStickers.includes(s.id));
	if (stickerMatch) {
		await message.channel.send({ stickers: [stickerMatch.id] });
		return;
	}
};