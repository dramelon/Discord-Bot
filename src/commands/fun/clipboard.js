const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// Register the font once when the bot starts.
// The name 'Silly Bug' here is the alias we created, so using it later in context.font is correct.
const fontPath = path.join(process.cwd(), 'assets', 'LayijiMahaniyomV1_61.ttf');
GlobalFonts.registerFromPath(fontPath, 'Layiji');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('clipboard')
		.setDescription('Write text on the clipboard image')
		.setContexts([0, 1, 2]) // Guild, Bot DM, Private Channel
		.setIntegrationTypes([0, 1]) // Guild Install, User Install
		.addStringOption(option =>
			option.setName('text')
				.setDescription('The text to display')
				.setRequired(true)),
	async execute(interaction) {
		await interaction.deferReply();

		const text = interaction.options.getString('text');
		
		// Path to your image asset
		// Make sure the "assets" folder is in your main project folder (next to package.json)
		const imagePath = path.join(process.cwd(), 'assets', 'base.png');

		try {
			const background = await loadImage(imagePath);
			const canvas = createCanvas(background.width, background.height);
			const context = canvas.getContext('2d');

			// Draw the background image
			context.drawImage(background, 0, 0);

			// --- Text Configuration & Geometry ---
			// Coordinates provided:
			// TL: (310, 803), TR: (1253, 870)
			// BL: (239, 1287), BR: (1192, 1412)
			
			// Calculate Center
			const centerX = (310 + 1253 + 1192 + 239) / 4; // 748.5
			const centerY = (803 + 870 + 1412 + 1287) / 4; // 1093

			// Calculate Rotation (Average of top and bottom edge slopes)
			const angleTop = Math.atan2(870 - 803, 1253 - 310);
			const angleBottom = Math.atan2(1412 - 1287, 1192 - 239);
			const rotation = (angleTop + angleBottom) / 2;

			// Define Box Dimensions (Approximate average width/height)
			const boxWidth = 950; 
			const boxHeight = 500;

			context.fillStyle = '#000000'; // Black text
			context.textAlign = 'left'; // We will calculate centering manually for mixed content
			context.textBaseline = 'middle';

			// --- 1. Tokenize Text (Split into Words and Emojis) ---
			// Regex matches Custom Emojis OR Unicode Emojis (Emoji_Presentation)
			const parts = text.split(/((?:<a?:.+?:\d+>)|(?:\p{Emoji_Presentation}))/gu);
			const tokens = [];
			for (const part of parts) {
				if (!part) continue;
				if (/^<a?:.+?:\d+>$/.test(part)) {
					const match = part.match(/<a?:.+?:(\d+)>/);
					tokens.push({ type: 'emoji', id: match[1], url: `https://cdn.discordapp.com/emojis/${match[1]}.png` });
				} else if (/^(\p{Emoji_Presentation})$/u.test(part)) {
					const codePoints = [...part].map(c => c.codePointAt(0).toString(16)).join('-');
					tokens.push({ type: 'emoji', url: `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png` });
				} else {
					// Split text by spaces to allow wrapping
					const words = part.split(/(\s+)/g);
					for (const word of words) {
						if (word) tokens.push({ type: 'text', content: word });
					}
				}
			}

			// --- 2. Load Emoji Images ---
			await Promise.all(tokens.filter(t => t.type === 'emoji').map(async t => {
				try {
					t.image = await loadImage(t.url);
				} catch (e) {
					t.type = 'text'; // Fallback if load fails
					t.content = '';
				}
			}));

			// Dynamic Font Sizing Loop
			let fontSize = 500; // Start with a large font
			let lines = [];
			let lineHeight = 0;

			do {
				context.font = `${fontSize}px "Layiji"`;
				lineHeight = fontSize * 1.1;
				
				// Calculate Lines
				lines = [];
				let currentLine = [];
				let currentLineWidth = 0;

				for (const token of tokens) {
					let tokenWidth;
					if (token.type === 'emoji') {
						// Calculate width based on aspect ratio to prevent stretching
						const aspectRatio = token.image.width / token.image.height;
						tokenWidth = fontSize * aspectRatio;
					} else {
						tokenWidth = context.measureText(token.content).width;
					}

					if (currentLineWidth + tokenWidth > boxWidth) {
						if (currentLine.length > 0) {
							lines.push({ tokens: currentLine, width: currentLineWidth });
							// If the token causing overflow is a space, skip it for the new line
							if (token.type === 'text' && /^\s+$/.test(token.content)) {
								currentLine = [];
								currentLineWidth = 0;
							} else {
								currentLine = [token];
								currentLineWidth = tokenWidth;
							}
						} else {
							// Single token is too big, force it
							currentLine = [token];
							currentLineWidth = tokenWidth;
						}
					} else {
						currentLine.push(token);
						currentLineWidth += tokenWidth;
					}
				}
				if (currentLine.length > 0) lines.push({ tokens: currentLine, width: currentLineWidth });

				const totalHeight = lines.length * lineHeight;
				const maxLineWidth = Math.max(...lines.map(l => l.width));

				if (totalHeight <= boxHeight && maxLineWidth <= boxWidth) {
					break;
				}
				fontSize -= 2;
			} while (fontSize > 10);

			// Apply Transformation
			context.translate(centerX, centerY);
			context.rotate(rotation);

			// Draw Text Centered
			const totalBlockHeight = lines.length * lineHeight;
			let currentY = -(totalBlockHeight / 2) + (lineHeight / 2);

			for (const line of lines) {
				// Calculate X to center this specific line
				let currentX = -(line.width / 2);

				for (const token of line.tokens) {
					if (token.type === 'emoji') {
						// Calculate draw dimensions based on aspect ratio
						const aspectRatio = token.image.width / token.image.height;
						const drawWidth = fontSize * aspectRatio;
						const drawHeight = fontSize;
						// Draw emoji centered vertically on the text baseline
						context.drawImage(token.image, currentX, currentY - (drawHeight / 2), drawWidth, drawHeight);
						currentX += drawWidth;
					} else {
						context.fillText(token.content, currentX, currentY);
						currentX += context.measureText(token.content).width;
					}
				}
				currentY += lineHeight;
			}

			// Create attachment
			const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'clipboard-result.png' });

			await interaction.editReply({ files: [attachment] });
		} catch (error) {
			console.error('Error generating clipboard image:', error);
			await interaction.editReply({ content: 'Failed to generate image. Please check if the asset file exists in the "assets" folder.' });
		}
	},
};