const { EmbedBuilder } = require('discord.js');

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
	"yellow": [255, 255, 0]
};

module.exports = async (message) => {
	// Ignore messages from bots
	if (message.author.bot) return;

	// Ignore messages that don't start with "!"
	if (!message.content.startsWith('!')) return;

	const reply = async (content) => {
		const botMsg = await message.reply(content);
		if (message.channel.id === '1472877917015900172') {
			setTimeout(async () => {
				try { await message.delete(); } catch (e) {}
				try { await botMsg.delete(); } catch (e) {}
			}, 30000);
		}
		return botMsg;
	};

	// Split the message into command and arguments
	const args = message.content.slice(1).trim().split(/ +/);
	const command = args.shift().toLowerCase();

	if (command === 'color') {
		// Handle empty command: Remove role
		if (args.length === 0) {
			if (!message.guild) return reply('This command can only be used in a server.');

			const existingRole = message.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));

			if (existingRole) {
				try {
					// Check if we should delete the role (if user is the only one)
					const shouldDelete = existingRole.members.size <= 1;

					await message.member.roles.remove(existingRole);
					await reply('Color role removed.');

					if (shouldDelete) {
						await existingRole.delete('Unused color role');
					}
				} catch (error) {
					console.error(error);
					await reply('Error: I cannot manage roles. Please check my permissions.');
				}
			} else {
				await reply('You do not have a color role to remove. For example, try `!color 255 0 0` or `!color red` to get a red role.');
			}
			return;
		}

		let r, g, b;
		const inputName = args.join(' ').toLowerCase();
		const hexMatch = inputName.match(/^(?:0x|#)?([0-9a-f]{6})$/i);
		const hexMatch3 = inputName.match(/^(?:0x|#)?([0-9a-f]{3})$/i);
		const decimalMatch = inputName.match(/^(\d{1,3})$/);
		const hexGrey = inputName.match(/^(?:0x|#)?([0-9a-f]{1,2})$/i);

		if (hexMatch) {
			const hexVal = parseInt(hexMatch[1], 16);
			r = (hexVal >> 16) & 255;
			g = (hexVal >> 8) & 255;
			b = hexVal & 255;
		} else if (decimalMatch && parseInt(decimalMatch[1], 10) <= 255) {
			const val = parseInt(decimalMatch[1], 10);
			r = g = b = val;
		} else if (colorMap[inputName]) {
			[r, g, b] = colorMap[inputName];
		} else if (hexMatch3) {
			const hexVal = parseInt(hexMatch3[1], 16);
			r = ((hexVal >> 8) & 0xF) * 0x11;
			g = ((hexVal >> 4) & 0xF) * 0x11;
			b = (hexVal & 0xF) * 0x11;
		} else if (args.length >= 3) {
			[r, g, b] = args.slice(0, 3).map(Number);
		} else if (hexGrey) {
			const raw = hexGrey[1];
			// Expand single char hex (e.g. "F" -> "FF" -> 255)
			const val = raw.length === 1 
				? parseInt(raw + raw, 16) 
				: parseInt(raw, 16);
			r = g = b = val;
		} else {
			// Fuzzy search
			const matches = Object.keys(colorMap)
				.map(name => ({ name, dist: levenshtein(inputName, name) }))
				.filter(item => item.dist <= 3) // Allow some typos
				.sort((a, b) => a.dist - b.dist)
				.slice(0, 5);

			if (matches.length > 0) {
				const options = matches.map((m, i) => `**${i + 1}.** \`${m.name}\` (${colorMap[m.name].join(', ')})`).join('\n');
				const promptMsg = await message.reply(`Color not found. Did you mean:\n${options}\n\nReply with the number (e.g., "1") or "no" to cancel.`);

				try {
					const filter = m => m.author.id === message.author.id && m.channel.id === message.channel.id;
					const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
					const response = collected.first();
					const content = response.content.toLowerCase();

					// Handle auto-delete for user response in specific channel
					if (message.channel.id === '1472877917015900172') {
						setTimeout(async () => { try { await response.delete(); } catch (e) {} }, 30000);
					}

					if (content === 'no' || content === 'cancel') {
						try { await promptMsg.edit('Selection cancelled.'); } catch (e) {}
						if (message.channel.id === '1472877917015900172') {
							setTimeout(async () => { try { await message.delete(); } catch (e) {} }, 5000);
							setTimeout(async () => { try { await promptMsg.delete(); } catch (e) {} }, 5000);
						}
						return;
					}

					const numMap = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
					let choice = parseInt(content);
					if (isNaN(choice)) choice = numMap[content];

					if (choice >= 1 && choice <= matches.length) {
						[r, g, b] = colorMap[matches[choice - 1].name];
						try { await promptMsg.delete(); } catch (e) {}
					} else {
						if (message.channel.id === '1472877917015900172') {
							setTimeout(async () => { try { await message.delete(); } catch (e) {} }, 30000);
							setTimeout(async () => { try { await promptMsg.delete(); } catch (e) {} }, 30000);
						}
						return;
					}
				} catch (e) {
					try { await promptMsg.edit('Selection timed out.'); } catch (err) {}
					if (message.channel.id === '1472877917015900172') {
						setTimeout(async () => { try { await message.delete(); } catch (e) {} }, 5000);
						setTimeout(async () => { try { await promptMsg.delete(); } catch (e) {} }, 5000);
					}
					return;
				}
			} else {
				return reply('Please provide RGB values, a hex code, or a valid color name. Usage: `!color 255 128 0`, `!color FF8000`, `!color 255` or `!color green`');
			}
		}

		// Validate numbers
		if ([r, g, b].some(val => isNaN(val) || val < 0 || val > 255)) {
			return reply('Invalid RGB values. Please use numbers between 0 and 255.');
		}

		const hex = [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
		const roleName = `0x${hex}`;

		if (!message.guild) return reply('This command can only be used in a server.');

		try {
			const existingRole = message.member.roles.cache.find(x => /^0x[0-9A-F]{6}$/i.test(x.name));

			if (existingRole) {
				if (existingRole.name === roleName) {
					return reply('You already have this color role!');
				}

				if (existingRole.members.size > 1) {
					await message.member.roles.remove(existingRole);
				} else {
					await existingRole.delete('Unused color role');
				}
			}

			let role = message.guild.roles.cache.find(x => x.name === roleName);

			if (!role) {
				role = await message.guild.roles.create({
					name: roleName,
					color: [r, g, b],
					reason: `Color command by ${message.author.tag}`,
					permissions: []
				});
			}

			await message.member.roles.add(role);

			const embed = new EmbedBuilder()
				.setTitle(`Color Applied: ${roleName}`)
				.setColor([r, g, b]);

			if (message.channel.id === '1472877917015900172') {
				embed.setFooter({ text: 'This message will be deleted in 30 seconds.' });
			}

			await reply({ embeds: [embed] });
		} catch (error) {
			console.error(error);
			await reply('Error: I cannot manage roles. Please check my permissions and role hierarchy.');
		}
	}
};