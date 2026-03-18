const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function levenshtein(a, b) {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	const matrix = [];
	for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
	for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
			}
		}
	}
	return matrix[b.length][a.length];
}

const colorMap = {
	"amaranth": [229, 43, 80],
	"amber": [255, 191, 0],
	"amethyst": [153, 102, 204],
	"apricot": [251, 206, 177],
	"aquamarine": [127, 255, 212],
	"azure": [0, 127, 255],
	"baby blue": [137, 207, 240],
	"beige": [245, 245, 220],
	"black": [0, 0, 0],
	"blue": [0, 0, 255],
	"blue-green": [0, 149, 182],
	"blue-violet": [138, 43, 226],
	"blush": [222, 93, 131],
	"bronze": [205, 127, 50],
	"brown": [150, 75, 0],
	"burgundy": [128, 0, 32],
	"byzantium": [112, 41, 99],
	"carmine": [150, 0, 24],
	"cerise": [222, 49, 99],
	"cerulean": [0, 123, 167],
	"champagne": [247, 231, 206],
	"chartreuse green": [127, 255, 0],
	"chocolate": [123, 63, 0],
	"cobalt blue": [0, 71, 171],
	"coffee": [111, 78, 55],
	"copper": [184, 115, 51],
	"coral": [255, 127, 80],
	"crimson": [220, 20, 60],
	"cyan": [0, 255, 255],
	"desert sand": [237, 201, 175],
	"electric blue": [125, 249, 255],
	"emerald": [80, 200, 120],
	"erin": [0, 255, 64],
	"gold": [255, 215, 0],
	"gray": [128, 128, 128],
	"grey": [128, 128, 128],
	"green": [0, 255, 0],
	"harlequin": [63, 255, 0],
	"indigo": [75, 0, 130],
	"ivory": [255, 255, 240],
	"jade": [0, 168, 107],
	"jungle green": [41, 171, 135],
	"lavender": [230, 230, 250],
	"lemon": [255, 247, 0],
	"lilac": [200, 162, 200],
	"lime": [191, 255, 0],
	"magenta": [255, 0, 255],
	"magenta rose": [255, 0, 175],
	"maroon": [128, 0, 0],
	"mauve": [224, 176, 255],
	"midnight blue": [25, 25, 112],
	"navy blue": [0, 0, 128],
	"ochre": [204, 119, 34],
	"olive": [128, 128, 0],
	"orange": [255, 165, 0],
	"orange-red": [255, 69, 0],
	"orchid": [218, 112, 214],
	"peach": [255, 229, 180],
	"pear": [209, 226, 49],
	"periwinkle": [204, 204, 255],
	"persian blue": [28, 57, 187],
	"pink": [255, 192, 203],
	"plum": [142, 69, 133],
	"prussian blue": [0, 49, 83],
	"puce": [204, 136, 153],
	"purple": [128, 0, 128],
	"raspberry": [227, 11, 92],
	"red": [255, 0, 0],
	"red-violet": [199, 21, 133],
	"rose": [255, 0, 127],
	"ruby": [224, 17, 95],
	"salmon": [250, 128, 114],
	"sangria": [146, 0, 10],
	"sapphire": [15, 82, 186],
	"scarlet": [255, 36, 0],
	"silver": [192, 192, 192],
	"slate gray": [112, 128, 144],
	"spring bud": [167, 252, 0],
	"spring green": [0, 255, 127],
	"tan": [210, 180, 140],
	"taupe": [72, 60, 50],
	"teal": [0, 128, 128],
	"turquoise": [64, 224, 208],
	"ultramarine": [18, 10, 143],
	"violet": [238, 130, 238],
	"viridian": [64, 130, 109],
	"white": [255, 255, 255],
	"yellow": [255, 255, 0],
	// custom names
	"dramelon": [255, 192, 203],
	//🔥 Fire & Earth (Reds, Oranges, Browns)
	"alizarin crimson": [227, 38, 54],
	"blood orange": [210, 16, 1],
	"burnt sienna": [233, 116, 81],
	"cayenne": [148, 17, 0],
	"clay": [182, 115, 82],
	"dark red": [139, 0, 0],
	"firebrick": [178, 34, 34],
	"mahogany": [192, 64, 0],
	"rust": [183, 65, 14],
	"terracotta": [226, 114, 91],
	// 🌿 Nature & Grove (Greens & Teals)
	"army green": [75, 83, 32],
	"celadon": [172, 225, 175],
	"forest green": [34, 139, 34],
	"kelly green": [76, 187, 23],
	"moss green": [138, 154, 91],
	"mint green": [152, 255, 152],
	"pine green": [1, 121, 111],
	"pistachio": [147, 197, 114],
	"seafoam green": [159, 226, 191],
	"shamrock": [0, 158, 96],
	// 🌌 Sky & Deep Sea (Blues & Purples)
	"cobalt": [0, 71, 171],
	"cornflower blue": [100, 149, 237],
	"deep sky blue": [0, 191, 255],
	"denim": [21, 96, 189],
	"dodger blue": [30, 144, 255],
	"eggplant": [97, 64, 81],
	"electric purple": [191, 0, 255],
	"royal blue": [65, 105, 225],
	"steel blue": [70, 130, 180],
	"wisteria": [201, 160, 220],
	// ✨ Treasure & Shine (Gold, Pinks, Neons)
	"bubblegum": [255, 193, 204],
	"canary yellow": [255, 239, 0],
	"cotton candy": [255, 188, 217],
	"hot pink": [255, 105, 180],
	"lemon chiffon": [255, 250, 205],
	"neon green": [57, 255, 20],
	"pearl": [234, 224, 200],
	"rose gold": [183, 110, 121],
	"shocking pink": [252, 15, 192],
	"topaz": [255, 200, 124],
	// 🐉 Special "Dragon" Inspired Colors
	"dragon fire": [236, 101, 33],
	"dragon ice": [175, 238, 238],
	"dragon wind": [240, 255, 255],
	"dragon lightning": [255, 255, 145],
	"dragon shadow": [45, 45, 70],
	"dragon spirit": [135, 206, 235],
	"dragon acid": [173, 255, 47],
	"obsidian": [28, 28, 28],
	"ancient gold": [207, 181, 59],
	"toxic waste": [142, 212, 0],
	"mystic purple": [112, 48, 160]
};

module.exports = {
	data: new SlashCommandBuilder()
		.setName('color')
		.setDescription('Manage your color role.')
		.setContexts([0]) // Guild Only
		.setIntegrationTypes([0]) // Guild Install Only
		.addSubcommand(subcommand =>
			subcommand.setName('color_name')
				.setDescription('Set color by name (e.g. red, blue)')
				.addStringOption(option =>
					option.setName('name')
						.setDescription('Color name - start typing to see suggestions')
						.setAutocomplete(true)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand.setName('hex')
				.setDescription('Set color by hex code (e.g. #FF8000)')
				.addStringOption(option =>
					option.setName('hex')
						.setDescription('Hex code (e.g. #FF8000)')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand.setName('rgb')
				.setDescription('Set color by RGB values (0-255)')
				.addIntegerOption(option =>
					option.setName('r')
						.setDescription('Red (0-255)')
						.setMinValue(0).setMaxValue(255).setRequired(true))
				.addIntegerOption(option =>
					option.setName('g')
						.setDescription('Green (0-255)')
						.setMinValue(0).setMaxValue(255).setRequired(true))
				.addIntegerOption(option =>
					option.setName('b')
						.setDescription('Blue (0-255)')
						.setMinValue(0).setMaxValue(255).setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand.setName('greyscale')
				.setDescription('Set color by greyscale value (0-255)')
				.addIntegerOption(option =>
					option.setName('number')
						.setDescription('Greyscale value (0-255)')
						.setMinValue(0).setMaxValue(255).setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand.setName('remove')
				.setDescription('Remove your color role')),
	async autocomplete(interaction) {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand !== 'color_name') return;

		const focusedValue = interaction.options.getFocused();
		// Prevent showing all 100+ colors on an empty input
		if (!focusedValue) {
			return await interaction.respond([]);
		}

		const choices = Object.keys(colorMap);
		const filtered = choices.filter(choice => choice.startsWith(focusedValue.toLowerCase())).slice(0, 25);
		await interaction.respond(filtered.map(choice => ({ name: choice, value: choice })));
	},
	async execute(interaction) {
		const isCleanChannel = interaction.channelId === '1472877917015900172';
		const subcommand = interaction.options.getSubcommand();

		// --- Handle Removal ---
		if (subcommand === 'remove') {
			const existingRole = interaction.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));
			if (existingRole) {
				try {
					const shouldDelete = existingRole.members.size <= 1;
					await interaction.member.roles.remove(existingRole);
					if (shouldDelete) await existingRole.delete('Unused color role');
					return interaction.reply({ content: 'Color role removed.', ephemeral: isCleanChannel });
				} catch (error) {
					console.error(error);
					return interaction.reply({ content: 'Error: I cannot manage roles. Please check my permissions.', ephemeral: true });
				}
			} else {
				return interaction.reply({ content: 'You do not have a color role to remove.', ephemeral: true });
			}
		}

		// --- Handle Color Calculation ---
		let r, g, b;

		if (subcommand === 'rgb') {
			r = interaction.options.getInteger('r');
			g = interaction.options.getInteger('g');
			b = interaction.options.getInteger('b');
		} else if (subcommand === 'greyscale') {
			const greyValue = interaction.options.getInteger('number');
			r = g = b = greyValue;
		} else if (subcommand === 'hex') {
			const hexOpt = interaction.options.getString('hex');
			const cleanHex = hexOpt.replace(/^#|0x/i, '');
			if (/^[0-9A-F]{6}$/i.test(cleanHex)) {
				const val = parseInt(cleanHex, 16);
				r = (val >> 16) & 255; g = (val >> 8) & 255; b = val & 255;
			} else if (/^[0-9A-F]{3}$/i.test(cleanHex)) {
				const val = parseInt(cleanHex, 16);
				r = ((val >> 8) & 0xF) * 0x11; g = ((val >> 4) & 0xF) * 0x11; b = (val & 0xF) * 0x11;
			} else {
				return interaction.reply({ content: 'Invalid hex code provided.', ephemeral: true });
			}
		} else if (subcommand === 'color_name') {
			const inputName = interaction.options.getString('name').toLowerCase();
			if (colorMap[inputName]) {
				[r, g, b] = colorMap[inputName];
			} else {
				// Fuzzy search if name doesn't exist
				const matches = Object.keys(colorMap)
					.map(name => ({ name, dist: levenshtein(inputName, name) }))
					.filter(item => item.dist <= 3)
					.sort((a, b) => a.dist - b.dist)
					.slice(0, 5);

				if (matches.length > 0) {
					const options = matches.map((m, i) => `**${i + 1}.** \`${m.name}\` (${colorMap[m.name].join(', ')})`).join('\n');
					return interaction.reply({
						content: `Color \`${inputName}\` not found. Did you mean:\n${options}\n\nTry selecting from the autocomplete suggestions!`,
						ephemeral: true
					});
				} else {
					return interaction.reply({ content: `Invalid color name: \`${inputName}\`.`, ephemeral: true });
				}
			}
		}

		// --- Apply Role ---
		if ([r, g, b].some(val => isNaN(val) || val < 0 || val > 255)) {
			return interaction.reply({ content: 'Invalid RGB values calculated.', ephemeral: true });
		}

		const hex = [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
		const roleName = `0x${hex}`;

		try {
			const existingRole = interaction.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));

			if (existingRole) {
				if (existingRole.name === roleName) {
					return interaction.reply({ content: 'You already have this color role!', ephemeral: true });
				}

				if (existingRole.members.size > 1) {
					await interaction.member.roles.remove(existingRole);
				} else {
					await existingRole.delete('Unused color role');
				}
			}

			let role = interaction.guild.roles.cache.find(x => x.name === roleName);

			if (!role) {
				role = await interaction.guild.roles.create({
					name: roleName,
					color: [r, g, b],
					reason: `Color command by ${interaction.user.tag}`,
					permissions: []
				});
			}

			await interaction.member.roles.add(role);

			const embed = new EmbedBuilder()
				.setTitle(`Color Applied: ${roleName}`)
				.setColor([r, g, b]);

			await interaction.reply({ embeds: [embed], ephemeral: isCleanChannel });
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'Error: I cannot manage roles. Please check my permissions and role hierarchy.', ephemeral: true });
		}
	},
};