const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');

function addCommonOptions(subcommand) {
	return subcommand
		.addBooleanOption(option =>
			option.setName('self_view')
				.setDescription('Whether the result is only visible to you (default: false)')
				.setRequired(false));
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stretch')
		.setDescription('Stretch an image/user/emoji/sticker!')
		.setContexts([0, 1, 2])
		.setIntegrationTypes([0, 1])
		// Subcommand: user
		.addSubcommand(subcommand => {
			subcommand.setName('user')
				.setDescription('Stretch a user!')
				.addUserOption(option =>
					option.setName('target')
						.setDescription('The user to stretch')
						.setRequired(true))
				.addBooleanOption(option =>
					option.setName('use_server_avatar')
						.setDescription('Use the server-specific avatar (default: false)')
						.setRequired(false));
			return addCommonOptions(subcommand);
		})
		// Subcommand: url
		.addSubcommand(subcommand => {
			subcommand.setName('url')
				.setDescription('Use an image URL to stretch')
				.addStringOption(option =>
					option.setName('url')
						.setDescription('The image URL to stretch')
						.setRequired(true));
			return addCommonOptions(subcommand);
		})
		// Subcommand: image_upload
		.addSubcommand(subcommand => {
			subcommand.setName('image_upload')
				.setDescription('Upload an image to stretch')
				.addAttachmentOption(option =>
					option.setName('attachment')
						.setDescription('The image to stretch')
						.setRequired(true));
			return addCommonOptions(subcommand);
		})
		// Subcommand: emoji
		.addSubcommand(subcommand => {
			subcommand.setName('emoji')
				.setDescription('Stretch an emoji!')
				.addStringOption(option =>
					option.setName('emoji')
						.setDescription('The emoji to stretch (accepts the first emoji found)')
						.setRequired(true));
			return addCommonOptions(subcommand);
		})
		// Subcommand: sticker
		.addSubcommand(subcommand => {
			subcommand.setName('sticker')
				.setDescription('Stretch a sticker! (The bot will wait for you to send a sticker)');
			return addCommonOptions(subcommand);
		}),

	async execute(interaction) {
		const selfView = interaction.options.getBoolean('self_view') ?? false;
		await interaction.deferReply({ ephemeral: selfView });

		const subcommand = interaction.options.getSubcommand();
		let source;

		try {
			if (subcommand === 'image_upload') {
				const attachment = interaction.options.getAttachment('attachment');
				if (!attachment.contentType?.startsWith('image/')) {
					return interaction.editReply({ content: 'Please upload a valid image file.' });
				}
				source = attachment.url;
			} else if (subcommand === 'url') {
				source = interaction.options.getString('url');
			} else if (subcommand === 'user') {
				const targetUser = interaction.options.getUser('target') || interaction.user;
				const targetMember = interaction.options.getMember('target') || interaction.member;
				const useServerAvatar = interaction.options.getBoolean('use_server_avatar') ?? false;

				if (useServerAvatar && targetMember && typeof targetMember.displayAvatarURL === 'function') {
					source = targetMember.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });
				} else {
					source = targetUser.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });
				}
			} else if (subcommand === 'emoji') {
				const emojiInput = interaction.options.getString('emoji');
				
				const customMatch = emojiInput.match(/<a?:.+?:(\d+)>/);
				const unicodeMatch = emojiInput.match(/\p{Emoji_Presentation}/u);
				const idMatch = emojiInput.match(/(\d{17,20})/);

				let firstMatch = null;
				let minIndex = Infinity;

				if (customMatch && customMatch.index < minIndex) {
					firstMatch = { type: 'custom', value: customMatch[1] };
					minIndex = customMatch.index;
				}
				if (unicodeMatch && unicodeMatch.index < minIndex) {
					firstMatch = { type: 'unicode', value: unicodeMatch[0] };
					minIndex = unicodeMatch.index;
				}
				if (idMatch && idMatch.index < minIndex) {
					firstMatch = { type: 'id', value: idMatch[1] };
					minIndex = idMatch.index;
				}

				if (!firstMatch) {
					return interaction.editReply({ content: 'No valid emoji found in your input.' });
				}

				if (firstMatch.type === 'custom' || firstMatch.type === 'id') {
					source = `https://cdn.discordapp.com/emojis/${firstMatch.value}.png`;
				} else if (firstMatch.type === 'unicode') {
					const codePoints = [...firstMatch.value].map(c => c.codePointAt(0).toString(16)).join('-');
					source = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png`;
				}
			} else if (subcommand === 'sticker') {
				await interaction.editReply({ content: 'Please send or reply with the sticker you want to stretch... (60s remaining)' });
				
				const filter = m => m.author.id === interaction.user.id;
				const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] })
					.catch(() => null);

				if (!collected || collected.size === 0) {
					return interaction.editReply({ content: 'Timed out: No sticker received in 60 seconds.' });
				}

				const firstMsg = collected.first();
				const sticker = firstMsg.stickers.first();

				if (!sticker) {
					return interaction.editReply({ content: 'Cancelled: No sticker detected in your message.' });
				}

				source = sticker.url;
				
				try {
					if (firstMsg.deletable) {
						await firstMsg.delete();
					}
				} catch (e) {
					console.error('Failed to delete sticker message:', e);
				}

				await interaction.editReply({ content: 'Sticker received! Generating stretch...' });
			}

			await generateStretchFromSource(interaction, source);
		} catch (error) {
			console.error('Error generating stretch image:', error);
			await interaction.editReply({ content: `Failed to generate image. Please ensure source is valid and \`assets/stretch_template.png\` exists. Error: ${error.message}` });
		}
	},
	generateStretchFromSource,
	extractImageSourceFromMessage,
};

function extractImageSourceFromMessage(message) {
	// 1. Check attachments
	const attachment = message.attachments.find(a => a.contentType?.startsWith('image/'));
	if (attachment) return attachment.url;

	// 2. Check stickers
	const sticker = message.stickers.first();
	if (sticker) return sticker.url;

	// 3. Check emojis in content
	if (message.content) {
		const customMatch = message.content.match(/<a?:.+?:(\d+)>/);
		const unicodeMatch = message.content.match(/\p{Emoji_Presentation}/u);
		const idMatch = message.content.match(/(\d{17,20})/);

		let firstMatch = null;
		let minIndex = Infinity;

		if (customMatch && customMatch.index < minIndex) {
			firstMatch = { type: 'custom', value: customMatch[1] };
			minIndex = customMatch.index;
		}
		if (unicodeMatch && unicodeMatch.index < minIndex) {
			firstMatch = { type: 'unicode', value: unicodeMatch[0] };
			minIndex = unicodeMatch.index;
		}
		if (idMatch && idMatch.index < minIndex) {
			firstMatch = { type: 'id', value: idMatch[1] };
			minIndex = idMatch.index;
		}

		if (firstMatch) {
			if (firstMatch.type === 'custom' || firstMatch.type === 'id') {
				return `https://cdn.discordapp.com/emojis/${firstMatch.value}.png`;
			} else if (firstMatch.type === 'unicode') {
				const codePoints = [...firstMatch.value].map(c => c.codePointAt(0).toString(16)).join('-');
				return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png`;
			}
		}
	}

	return null;
}

async function generateStretchFromSource(interaction, source) {
	if (!source) {
		return interaction.editReply({ content: 'Failed to resolve an image source.' });
	}

	const imagePath = path.join(process.cwd(), 'assets', 'stretch_template.png');
	const background = await loadImage(imagePath);
	const avatar = await loadImage(source);

	const canvas = createCanvas(background.width, background.height);
	const context = canvas.getContext('2d');

	// 1. Draw Background
	context.drawImage(background, 0, 0);

	// 2. Configure Stretch Area
	const tl = { x: 280, y: 257 };
	const tr = { x: 2994, y: 364 };
	const bl = { x: 245, y: 972 };
	const br = { x: 3032, y: 1000 };

	// 3. Draw Avatar (Stretched)
	const numSlices = 500;
	const step = 1 / numSlices;

	for (let i = 0; i < numSlices; i++) {
		const t = i * step;
		const tNext = (i + 1) * step;

		// Source (Avatar) Slice
		const sx = t * avatar.width;
		const sw = avatar.width * step;
		const sy = 0;
		const sh = avatar.height;

		// Destination Slice Calculation
		const topX = tl.x + (tr.x - tl.x) * t;
		const topY = tl.y + (tr.y - tl.y) * t;
		const botX = bl.x + (br.x - bl.x) * t;
		const botY = bl.y + (br.y - bl.y) * t;

		const topXNext = tl.x + (tr.x - tl.x) * tNext;
		const botXNext = bl.x + (br.x - bl.x) * tNext;

		const dwTop = topXNext - topX;
		const dwBot = botXNext - botX;
		const dw = Math.max(Math.abs(dwTop), Math.abs(dwBot)) + 1.5;

		const dx = botX - topX;
		const dy = botY - topY;
		const height = Math.hypot(dx, dy);
		const angle = Math.atan2(dy, dx) - Math.PI / 2;

		context.save();
		context.translate(topX, topY);
		context.rotate(angle);
		context.drawImage(avatar, sx, sy, sw, sh, 0, 0, dw, height);
		context.restore();
	}

	const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'stretch.png' });

	await interaction.editReply({ content: null, files: [attachment] });
}