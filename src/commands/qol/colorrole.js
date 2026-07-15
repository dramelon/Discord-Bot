const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const apiTracker = require('../../utils/apiTracker');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('color')
		.setDescription('Manage your custom color role.')
		.setContexts([0]) // Guild Only
		.setIntegrationTypes([0]), // Guild Install Only

	async execute(interaction) {
		const isCleanChannel = interaction.channelId === '1472877917015900172';
		const existingRole = interaction.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));

		const embed = new EmbedBuilder()
			.setTitle('Custom Color Role')
			.setDescription(existingRole 
				? `You currently have a custom color role: ${existingRole}.\nColor Hex: \`#${existingRole.name.substring(2)}\``
				: 'You do not have a custom color role right now.'
			)
			.setColor(existingRole ? existingRole.color : '#2b2d31');

		const iconUrl = existingRole?.iconURL({ extension: 'png', size: 1024 });
		if (iconUrl) {
			embed.setThumbnail(iconUrl);
		}

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('color_edit')
					.setLabel(existingRole ? 'Edit Color & Icon' : 'Create Custom Color')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId('color_remove')
					.setLabel('Remove Color Role')
					.setStyle(ButtonStyle.Danger)
					.setDisabled(!existingRole)
			);

		return interaction.reply({ embeds: [embed], components: [row], ephemeral: isCleanChannel });
	},

	async handleButton(interaction) {
		const isCleanChannel = interaction.channelId === '1472877917015900172';
		const existingRole = interaction.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));

		if (interaction.customId === 'color_remove') {
			if (!existingRole) {
				return interaction.reply({ content: 'You do not have a custom color role to remove.', ephemeral: true });
			}

			try {
				const shouldDelete = existingRole.members.size <= 1;
				await interaction.member.roles.remove(existingRole);
				if (shouldDelete) {
					await existingRole.delete('Unused color role');
				}
				return interaction.reply({ content: 'Your custom color role has been removed.', ephemeral: isCleanChannel });
			} catch (error) {
				console.error(error);
				return interaction.reply({ content: 'Error: I cannot manage roles. Please check my permissions and role hierarchy.', ephemeral: true });
			}
		}

		if (interaction.customId === 'color_edit') {
			const modal = new ModalBuilder()
				.setCustomId('color_modal')
				.setTitle('Customize Color Role');

			const colorInput = new TextInputBuilder()
				.setCustomId('color_hex')
				.setLabel('Role Color (Hex Code)')
				.setStyle(TextInputStyle.Short)
				.setPlaceholder('#FF8000')
				.setRequired(true)
				.setMinLength(3)
				.setMaxLength(9);

			const iconInput = new TextInputBuilder()
				.setCustomId('color_icon')
				.setLabel('Role Icon Image URL')
				.setStyle(TextInputStyle.Short)
				.setPlaceholder('https://example.com/image.png')
				.setRequired(false);

			if (existingRole) {
				colorInput.setValue(existingRole.name.replace(/^0x/i, '#'));
				const currentIconUrl = existingRole.iconURL({ extension: 'png', size: 1024 });
				if (currentIconUrl) {
					iconInput.setValue(currentIconUrl);
				}
			}

			const row1 = new ActionRowBuilder().addComponents(colorInput);
			const row2 = new ActionRowBuilder().addComponents(iconInput);
			modal.addComponents(row1, row2);

			await interaction.showModal(modal);
		}
	},

	async handleModal(interaction) {
		if (interaction.customId !== 'color_modal') return;

		const isCleanChannel = interaction.channelId === '1472877917015900172';
		const hexOpt = interaction.fields.getTextInputValue('color_hex').trim();
		const iconUrl = interaction.fields.getTextInputValue('color_icon').trim();

		// Defer interaction since downloading images and setting roles can take a couple of seconds
		await interaction.deferReply({ ephemeral: isCleanChannel });

		// Validate Hex
		const cleanHex = hexOpt.replace(/^#|0x/i, '');
		let r, g, b;

		if (/^[0-9A-F]{6}$/i.test(cleanHex)) {
			const val = parseInt(cleanHex, 16);
			r = (val >> 16) & 255; g = (val >> 8) & 255; b = val & 255;
		} else if (/^[0-9A-F]{3}$/i.test(cleanHex)) {
			const val = parseInt(cleanHex, 16);
			r = ((val >> 8) & 0xF) * 0x11; g = ((val >> 4) & 0xF) * 0x11; b = (val & 0xF) * 0x11;
		} else {
			return interaction.editReply({ content: 'Invalid hex color code. Please provide a valid hex code like `#FF8000` or `FF8000`.' });
		}

		if ([r, g, b].some(val => isNaN(val) || val < 0 || val > 255)) {
			return interaction.editReply({ content: 'Invalid RGB values calculated from hex code.' });
		}

		const hex = [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
		const roleName = `0x${hex}`;

		// Validate Icon URL and Fetch
		let iconBuffer = null;
		if (iconUrl) {
			if (!/^https?:\/\//i.test(iconUrl)) {
				return interaction.editReply({ content: 'Invalid image URL. It must start with `http://` or `https://`.' });
			}
			try {
				const response = await apiTracker.fetch(iconUrl);
				if (!response.ok) {
					return interaction.editReply({ content: `Failed to download the image from the URL. Server returned status: ${response.status} ${response.statusText}` });
				}
				const arrayBuffer = await response.arrayBuffer();
				const rawBuffer = Buffer.from(arrayBuffer);

				// Process using @napi-rs/canvas to preserve transparency and output standard PNG
				try {
					const image = await loadImage(rawBuffer);
					const canvas = createCanvas(image.width, image.height);
					const ctx = canvas.getContext('2d');
					ctx.clearRect(0, 0, image.width, image.height);
					ctx.drawImage(image, 0, 0);
					iconBuffer = await canvas.encode('png');
				} catch (canvasError) {
					console.error('Canvas processing failed, falling back to raw buffer:', canvasError);
					iconBuffer = rawBuffer;
				}
			} catch (err) {
				console.error('Error fetching image icon:', err);
				return interaction.editReply({ content: `Error downloading role icon image: ${err.message}. Please verify the URL is public and directly points to an image.` });
			}
		}

		try {
			const existingRole = interaction.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));

			// If they have an existing color role, remove or delete it if it's different from the target role
			if (existingRole && existingRole.name !== roleName) {
				const shouldDelete = existingRole.members.size <= 1;
				await interaction.member.roles.remove(existingRole);
				if (shouldDelete) {
					await existingRole.delete('User changed to a different color role');
				}
			}

			// Find or create the role with target name/color
			let role = interaction.guild.roles.cache.find(x => x.name === roleName);
			
			// If color is #000000, name the role 0x000000 but set actual role color to #000001
			const colorToApply = (r === 0 && g === 0 && b === 0) ? [0, 0, 1] : [r, g, b];

			if (!role) {
				role = await interaction.guild.roles.create({
					name: roleName,
					color: colorToApply,
					icon: iconBuffer,
					reason: `Color command by ${interaction.user.tag}`,
					permissions: []
				});
			} else {
				// Update existing role's icon and color
				await role.edit({
					color: colorToApply,
					icon: iconBuffer,
					reason: `Color command update by ${interaction.user.tag}`
				});
			}

			await interaction.member.roles.add(role);

			const embed = new EmbedBuilder()
				.setTitle(`Color Applied: ${roleName}`)
				.setColor(colorToApply);

			if (iconUrl) {
				embed.setThumbnail(iconUrl);
			}

			await interaction.editReply({ content: null, embeds: [embed] });
		} catch (error) {
			console.error('Error managing custom color role:', error);
			await interaction.editReply({ content: 'Error: I cannot manage roles or icons. Please check my permissions (e.g. "Manage Roles") and ensure my role position is high enough in the server settings.' });
		}
	}
};