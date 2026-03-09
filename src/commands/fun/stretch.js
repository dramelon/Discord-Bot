const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stretch')
		.setDescription('Stretch a user\'s avatar onto an image')
		.setContexts([0, 1, 2])
		.setIntegrationTypes([0, 1])
		.addUserOption(option =>
			option.setName('target')
				.setDescription('The user to stretch (defaults to you)')
				.setRequired(false)),
	async execute(interaction) {
		await interaction.deferReply();

		const targetUser = interaction.options.getUser('target') || interaction.user;
		const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 1024 });
		
		// Path to your new image asset
		// Make sure to add 'stretch_template.png' to your assets folder!
		const imagePath = path.join(process.cwd(), 'assets', 'stretch_template.png');

		try {
			const background = await loadImage(imagePath);
			const avatar = await loadImage(avatarUrl);

			const canvas = createCanvas(background.width, background.height);
			const context = canvas.getContext('2d');

			// 1. Draw Background
			context.drawImage(background, 0, 0);

			// 2. Configure Stretch Area
			// Coordinates provided:
			// TL: (280, 257), TR: (2994, 364)
			// BL: (249, 973), BR: (3022, 996)

			const tl = { x: 280, y: 257 };
			const tr = { x: 2994, y: 364 };
			const bl = { x: 245, y: 972 };
			const br = { x: 3032, y: 1000 };

			// 3. Draw Avatar (Stretched)
			// Use vertical strips to approximate perspective/quadrilateral warping
			const numSlices = 500; // Higher number = smoother distortion
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

				// Calculate width (max of top/bottom width to avoid gaps)
				const dwTop = topXNext - topX;
				const dwBot = botXNext - botX;
				const dw = Math.max(Math.abs(dwTop), Math.abs(dwBot)) + 1.5; // Add slight overlap to prevent gaps

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

			await interaction.editReply({ files: [attachment] });
		} catch (error) {
			console.error('Error generating stretch image:', error);
			await interaction.editReply({ content: `Failed to generate image. Please ensure \`assets/stretch_base.png\` exists. Error: ${error.message}` });
		}
	},
};