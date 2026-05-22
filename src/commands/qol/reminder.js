const { 
	SlashCommandBuilder, 
	ModalBuilder, 
	LabelBuilder, 
	TextInputBuilder, 
	TextInputStyle, 
	MentionableSelectMenuBuilder, 
	EmbedBuilder, 
	ActionRowBuilder, 
	ButtonBuilder, 
	ButtonStyle,
	PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { parseDateTime, parseRepeat, getNextTriggerTime } = require('../../utils/timeParser');

const dataDir = path.join(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'reminder.json');

// Ensure data directory and file exist
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(dataPath)) {
	fs.writeFileSync(dataPath, JSON.stringify({ reminders: [] }, null, 2), 'utf8');
}

/**
 * Helper to update an older message, removing components and indicating it has already triggered.
 */
async function updateOlderMessage(client, channelId, messageId, statusText) {
	if (!channelId || !messageId) return;
	try {
		const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
		if (!channel) return;
		const message = await channel.messages.fetch(messageId).catch(() => null);
		if (!message) return;

		const oldEmbeds = message.embeds.map(e => EmbedBuilder.from(e));
		if (oldEmbeds[0]) {
			const statusFieldIndex = oldEmbeds[0].data.fields?.findIndex(f => f.name === 'ℹ️ Status' || f.name === '⏹️ Stopped');
			if (statusFieldIndex !== undefined && statusFieldIndex !== -1) {
				oldEmbeds[0].data.fields[statusFieldIndex].name = 'ℹ️ Status';
				oldEmbeds[0].data.fields[statusFieldIndex].value = statusText;
			} else {
				oldEmbeds[0].addFields({ name: 'ℹ️ Status', value: statusText });
			}
			oldEmbeds[0].setColor('#cccccc');
		}

		await message.edit({
			embeds: oldEmbeds,
			components: []
		}).catch(() => null);
	} catch (err) {
		console.error('Failed to update older reminder message:', err);
	}
}

/**
 * Formats a timestamp into YYYY-MM-DD HH:mm in local timezone.
 */
function formatLocalTime(ts) {
	const d = new Date(ts);
	const pad = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Saves a reminder to the persistence JSON file.
 */
async function saveReminder(interaction, name, description, timestamp, mentions, repeat, repeatRaw) {
	const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

	const embed = new EmbedBuilder()
		.setTitle('✅ Reminder Scheduled')
		.setColor('#00ff00')
		.addFields(
			{ name: '📌 Name', value: name, inline: true },
			{ name: '⏰ Time', value: `<t:${Math.floor(timestamp / 1000)}:F> (<t:${Math.floor(timestamp / 1000)}:R>)`, inline: true },
			{ name: '🔄 Repeat', value: repeatRaw ? `\`${repeatRaw}\`` : 'None', inline: true }
		)
		.setTimestamp();

	if (description) {
		embed.setDescription(description);
	}
	embed.addFields({ name: '👤 Created By', value: `<@${interaction.user.id}>`, inline: true });
	if (mentions && mentions.length > 0) {
		embed.addFields({ name: '👥 Mentions', value: mentions.join(' '), inline: true });
	}

	const components = [];
	const row = new ActionRowBuilder();
	if (repeat) {
		const stopButton = new ButtonBuilder()
			.setCustomId(`reminder_stop_${id}`)
			.setLabel('Stop Repeating')
			.setStyle(ButtonStyle.Danger);
		row.addComponents(stopButton);
	}
	const configButton = new ButtonBuilder()
		.setCustomId(`reminder_edit_${id}`)
		.setLabel('Configure')
		.setStyle(ButtonStyle.Secondary);
	row.addComponents(configButton);
	components.push(row);

	let response;
	if (interaction.replied || interaction.deferred) {
		response = await interaction.followUp({ embeds: [embed], components, ephemeral: false });
	} else {
		response = await interaction.reply({ embeds: [embed], components, ephemeral: false });
	}

	let lastMessageId = null;
	let lastChannelId = null;

	if (interaction.replied || interaction.deferred) {
		if (response) {
			lastMessageId = response.id;
			lastChannelId = response.channelId;
		}
	} else {
		const reply = await interaction.fetchReply().catch(() => null);
		if (reply) {
			lastMessageId = reply.id;
			lastChannelId = reply.channelId;
		}
	}

	const reminder = {
		id,
		userId: interaction.user.id,
		name,
		description,
		time: timestamp,
		mentions,
		repeat,
		repeatRaw,
		lastMessageId,
		lastChannelId,
		notified: false
	};

	let data = { reminders: [] };
	if (fs.existsSync(dataPath)) {
		try {
			const fileContent = fs.readFileSync(dataPath, 'utf8');
			data = JSON.parse(fileContent);
			if (!data.reminders) data.reminders = [];
		} catch (e) {
			console.error('Error parsing reminders file, resetting structure', e);
		}
	}

	data.reminders.push(reminder);
	fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Updates an existing reminder in the database and its associated scheduled message.
 */
async function updateReminderDetails(interaction, reminderId, name, description, timestamp, mentions, repeat, repeatRaw) {
	if (!fs.existsSync(dataPath)) {
		return interaction.reply({ content: '❌ Database not found.', ephemeral: true });
	}

	let data;
	try {
		data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
	} catch (e) {
		return interaction.reply({ content: '❌ Failed to read database.', ephemeral: true });
	}

	const index = data.reminders.findIndex(r => r.id === reminderId);
	if (index === -1) {
		return interaction.reply({ content: '❌ Reminder not found.', ephemeral: true });
	}

	const reminder = data.reminders[index];
	reminder.name = name;
	reminder.description = description;
	reminder.time = timestamp;
	reminder.mentions = mentions;
	reminder.repeat = repeat;
	reminder.repeatRaw = repeatRaw;

	fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');

	const embed = new EmbedBuilder()
		.setTitle('✅ Reminder Scheduled (Configured)')
		.setColor('#00ff00')
		.addFields(
			{ name: '📌 Name', value: name, inline: true },
			{ name: '⏰ Time', value: `<t:${Math.floor(timestamp / 1000)}:F> (<t:${Math.floor(timestamp / 1000)}:R>)`, inline: true },
			{ name: '🔄 Repeat', value: repeatRaw ? `\`${repeatRaw}\`` : 'None', inline: true },
			{ name: '👤 Created By', value: `<@${reminder.userId}>`, inline: true }
		)
		.setTimestamp();

	if (description) {
		embed.setDescription(description);
	}
	if (mentions && mentions.length > 0) {
		embed.addFields({ name: '👥 Mentions', value: mentions.join(' '), inline: true });
	}

	const components = [];
	const row = new ActionRowBuilder();

	if (repeat) {
		const stopButton = new ButtonBuilder()
			.setCustomId(`reminder_stop_${reminder.id}`)
			.setLabel('Stop Repeating')
			.setStyle(ButtonStyle.Danger);
		row.addComponents(stopButton);
	}

	const configButton = new ButtonBuilder()
		.setCustomId(`reminder_edit_${reminder.id}`)
		.setLabel('Configure')
		.setStyle(ButtonStyle.Secondary);
	row.addComponents(configButton);

	components.push(row);

	if (interaction.replied || interaction.deferred) {
		// Edit the message manually since the interaction has already been acknowledged (e.g. custom collector flow)
		if (reminder.lastMessageId && reminder.lastChannelId) {
			try {
				const channel = interaction.client.channels.cache.get(reminder.lastChannelId) || await interaction.client.channels.fetch(reminder.lastChannelId).catch(() => null);
				if (channel) {
					const message = await channel.messages.fetch(reminder.lastMessageId).catch(() => null);
					if (message) {
						await message.edit({ embeds: [embed], components: components }).catch(() => null);
					}
				}
			} catch (err) {
				console.error('Failed to update scheduled message on edit:', err);
			}
		}
		await interaction.followUp({ content: '✅ Reminder configured successfully!', ephemeral: true });
	} else {
		// Edit the embed directly, showing everyone that it was updated
		await interaction.update({ embeds: [embed], components: components });
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reminder')
		.setDescription('Create a reminder with name, description, time, mentions, and repeat options.')
		.setContexts([0, 1, 2])
		.setIntegrationTypes([0, 1]),

	async execute(interaction) {
		const modal = new ModalBuilder()
			.setCustomId('reminder_modal')
			.setTitle('Create a Reminder');

		// 1. Name of the reminder
		const nameInput = new TextInputBuilder()
			.setCustomId('reminder_name')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('Enter a name/title for the reminder...')
			.setRequired(true)
			.setMaxLength(100);

		const nameLabel = new LabelBuilder()
			.setLabel('Reminder Title')
			.setTextInputComponent(nameInput);

		// 2. Description
		const descInput = new TextInputBuilder()
			.setCustomId('reminder_description')
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder('Details about what you want to be reminded of...')
			.setRequired(false)
			.setMaxLength(1000);

		const descLabel = new LabelBuilder()
			.setLabel('Description (Optional)')
			.setTextInputComponent(descInput);

		// 3. When to remind
		const timeInput = new TextInputBuilder()
			.setCustomId('reminder_time')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('e.g., 30m, 1h, tomorrow 14:30, 2026-05-23 15:00, or type "custom"')
			.setRequired(true)
			.setMaxLength(100);

		const timeLabel = new LabelBuilder()
			.setLabel('When? (e.g. 1h, tomorrow 14:30, or custom)')
			.setTextInputComponent(timeInput);

		// 4. Mentionables (Users/Roles)
		const mentionsSelect = new MentionableSelectMenuBuilder()
			.setCustomId('reminder_mentions')
			.setMinValues(1)
			.setMaxValues(10)
			.setRequired(true);

		const mentionsLabel = new LabelBuilder()
			.setLabel('Who to mention? (At least 1 user)')
			.setMentionableSelectMenuComponent(mentionsSelect);

		// 5. Repeat options
		const repeatInput = new TextInputBuilder()
			.setCustomId('reminder_repeat')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('e.g., daily, weekly, monthly, 30m, 2h (leave empty for none)')
			.setRequired(false)
			.setMaxLength(50);

		const repeatLabel = new LabelBuilder()
			.setLabel('Repeat? (daily, weekly, 30m, or leave empty)')
			.setTextInputComponent(repeatInput);

		// Add components using the modern LabelBuilder
		modal.addComponents(nameLabel, descLabel, timeLabel, mentionsLabel, repeatLabel);

		await interaction.showModal(modal);
	},

	async handleModal(interaction) {
		if (!interaction.customId.startsWith('reminder_modal') && !interaction.customId.startsWith('reminder_editmodal_')) return;

		const isEdit = interaction.customId.startsWith('reminder_editmodal_');
		const editReminderId = isEdit ? interaction.customId.replace('reminder_editmodal_', '') : null;

		if (isEdit) {
			if (!fs.existsSync(dataPath)) {
				return interaction.reply({ content: '❌ Reminders database not found.', ephemeral: true });
			}
			let data;
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				return interaction.reply({ content: '❌ Failed to read reminders database.', ephemeral: true });
			}

			const existingReminder = data.reminders?.find(r => r.id === editReminderId);
			if (existingReminder && existingReminder.notified) {
				// Parse what the user just submitted:
				const name = interaction.fields.getTextInputValue('reminder_name').trim();
				const description = interaction.fields.getTextInputValue('reminder_description').trim() || null;
				const timeStr = interaction.fields.getTextInputValue('reminder_time').trim();
				const repeatStr = interaction.fields.getTextInputValue('reminder_repeat').trim() || null;

				const mentionsData = interaction.fields.getSelectedMentionables('reminder_mentions');
				const mentionIds = [];
				if (mentionsData) {
					for (const userId of mentionsData.users.keys()) {
						mentionIds.push(`<@${userId}>`);
					}
					for (const roleId of mentionsData.roles.keys()) {
						mentionIds.push(`<@&${roleId}>`);
					}
				}

				let repeatObj = null;
				if (repeatStr) {
					repeatObj = parseRepeat(repeatStr);
					if (!repeatObj) {
						return interaction.reply({ 
							content: '❌ Invalid repeat format. Please use "daily", "weekly", "monthly", or a duration like "30m", "2h", "1d".', 
							ephemeral: true 
						});
					}
				}

				// Backup what the user just submitted to the database right now (save description, name, mentions, repeat)
				existingReminder.name = name;
				existingReminder.description = description;
				existingReminder.mentions = mentionIds;
				existingReminder.repeat = repeatObj;
				existingReminder.repeatRaw = repeatStr;
				fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');

				const parsedTimestamp = parseDateTime(timeStr);
				if (parsedTimestamp && parsedTimestamp > Date.now()) {
					// Time is in the future and valid! Let's activate/reschedule it directly and send the confirmation message.
					existingReminder.time = parsedTimestamp;
					existingReminder.notified = false;

					// Send the new confirmation message in the channel
					const embed = new EmbedBuilder()
						.setTitle('✅ Reminder Re-scheduled (New)')
						.setColor('#00ff00')
						.addFields(
							{ name: '📌 Name', value: name, inline: true },
							{ name: '⏰ Time', value: `<t:${Math.floor(parsedTimestamp / 1000)}:F> (<t:${Math.floor(parsedTimestamp / 1000)}:R>)`, inline: true },
							{ name: '🔄 Repeat', value: repeatStr ? `\`${repeatStr}\`` : 'None', inline: true },
							{ name: '👤 Created By', value: `<@${existingReminder.userId}>`, inline: true }
						)
						.setTimestamp();

					if (description) embed.setDescription(description);
					if (mentionIds.length > 0) {
						embed.addFields({ name: '👥 Mentions', value: mentionIds.join(' '), inline: true });
					}

					const components = [];
					const row = new ActionRowBuilder();
					if (repeatObj) {
						const stopButton = new ButtonBuilder()
							.setCustomId(`reminder_stop_${existingReminder.id}`)
							.setLabel('Stop Repeating')
							.setStyle(ButtonStyle.Danger);
						row.addComponents(stopButton);
					}
					const configButton = new ButtonBuilder()
						.setCustomId(`reminder_edit_${existingReminder.id}`)
						.setLabel('Configure')
						.setStyle(ButtonStyle.Secondary);
					row.addComponents(configButton);
					components.push(row);

					const response = await interaction.reply({ embeds: [embed], components, ephemeral: false });
					
					let lastMessageId = null;
					let lastChannelId = null;
					const reply = await interaction.fetchReply().catch(() => null);
					if (reply) {
						lastMessageId = reply.id;
						lastChannelId = reply.channelId;
					}

					existingReminder.lastMessageId = lastMessageId;
					existingReminder.lastChannelId = lastChannelId;

					fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
					return;
				} else {
					// Time is past or invalid. Display warning message prompt asking user to reschedule.
					const embed = new EmbedBuilder()
						.setTitle('⚠️ Reminder Already Notified & Past Time')
						.setColor('#ff3333')
						.setDescription(`The reminder **"${name}"** has already triggered, and the time you entered (\`${timeStr}\`) is in the past.\n\nDo you want to reschedule/re-enable it to a new future time? (Your other configuration changes have been backed up)`)
						.setTimestamp();

					const reschedButton = new ButtonBuilder()
						.setCustomId(`reminder_resched_${editReminderId}`)
						.setLabel('Yes, Reschedule')
						.setStyle(ButtonStyle.Success);

					const cancelButton = new ButtonBuilder()
						.setCustomId('reminder_cancel_edit')
						.setLabel('No, Cancel')
						.setStyle(ButtonStyle.Secondary);

					const row = new ActionRowBuilder().addComponents(reschedButton, cancelButton);

					return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
				}
			}
		}

		const name = interaction.fields.getTextInputValue('reminder_name').trim();
		const description = interaction.fields.getTextInputValue('reminder_description').trim() || null;
		const timeStr = interaction.fields.getTextInputValue('reminder_time').trim();
		const repeatStr = interaction.fields.getTextInputValue('reminder_repeat').trim() || null;

		// Extract mentions from MentionableSelectMenu
		const mentionsData = interaction.fields.getSelectedMentionables('reminder_mentions');
		const mentionIds = [];
		if (mentionsData) {
			for (const userId of mentionsData.users.keys()) {
				mentionIds.push(`<@${userId}>`);
			}
			for (const roleId of mentionsData.roles.keys()) {
				mentionIds.push(`<@&${roleId}>`);
			}
		}

		// Validate repeat if provided
		let repeatObj = null;
		if (repeatStr) {
			repeatObj = parseRepeat(repeatStr);
			if (!repeatObj) {
				return interaction.reply({ 
					content: '❌ Invalid repeat format. Please use "daily", "weekly", "monthly", or a duration like "30m", "2h", "1d".', 
					ephemeral: true 
				});
			}
		}

		// Check if we need to collect custom time manually
		if (timeStr.toLowerCase() === 'custom') {
			await interaction.reply({
				content: '💬 Please reply to this channel with your custom date/time (e.g. `2026-05-23 15:00` or `tomorrow 14:30`).\n' +
						 '💡 **Hint**: You can use Discord\'s built-in feature by typing `@time` to select and format a timestamp.\n' +
						 '⏳ You have **5 minutes** (300 seconds) to reply.',
				ephemeral: true
			});

			const filter = m => m.author.id === interaction.user.id;
			const collector = interaction.channel.createMessageCollector({ filter, time: 300000, max: 1 });

			collector.on('collect', async m => {
				const customTimeStr = m.content.trim();
				const parsedTimestamp = parseDateTime(customTimeStr);

				// Attempt to clean up the message
				try {
					await m.delete();
				} catch (_) {}

				if (!parsedTimestamp) {
					await interaction.followUp({ 
						content: '❌ Invalid date/time format. Action cancelled. Please try again.', 
						ephemeral: true 
					});
					return;
				}

				if (parsedTimestamp <= Date.now()) {
					await interaction.followUp({ 
						content: '❌ The scheduled time must be in the future. Action cancelled.', 
						ephemeral: true 
					});
					return;
				}

				if (isEdit) {
					await updateReminderDetails(interaction, editReminderId, name, description, parsedTimestamp, mentionIds, repeatObj, repeatStr);
				} else {
					await saveReminder(interaction, name, description, parsedTimestamp, mentionIds, repeatObj, repeatStr);
				}
			});

			collector.on('end', async (collected, reason) => {
				if (reason === 'time') {
					await interaction.followUp({ 
						content: '⏳ Time out: You did not reply within 5 minutes. Action was not completed.', 
						ephemeral: true 
					});
				}
			});
		} else {
			// Normal flow: parse time directly
			const parsedTimestamp = parseDateTime(timeStr);
			if (!parsedTimestamp) {
				return interaction.reply({ 
					content: '❌ Invalid date/time format. Please try again (e.g., `30m`, `1h`, `tomorrow 14:30`, or type `custom`).', 
					ephemeral: true 
				});
			}

			if (parsedTimestamp <= Date.now()) {
				return interaction.reply({ 
					content: '❌ The scheduled time must be in the future.', 
					ephemeral: true 
				});
			}

			if (isEdit) {
				await updateReminderDetails(interaction, editReminderId, name, description, parsedTimestamp, mentionIds, repeatObj, repeatStr);
			} else {
				await saveReminder(interaction, name, description, parsedTimestamp, mentionIds, repeatObj, repeatStr);
			}
		}
	},

	async handleButton(interaction) {
		if (interaction.customId.startsWith('reminder_stop_')) {
			const reminderId = interaction.customId.replace('reminder_stop_', '');
			
			if (!fs.existsSync(dataPath)) {
				return interaction.reply({ content: '❌ No reminders found.', ephemeral: true });
			}

			let data;
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				return interaction.reply({ content: '❌ Failed to load reminders database.', ephemeral: true });
			}

			if (!data.reminders) data.reminders = [];
			const reminderIndex = data.reminders.findIndex(r => r.id === reminderId);

			if (reminderIndex === -1) {
				return interaction.reply({ content: '❌ This reminder has already been stopped or expired.', ephemeral: true });
			}

			const reminder = data.reminders[reminderIndex];

			// Permissions check: creator or Administrator
			const isCreator = interaction.user.id === reminder.userId;
			const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

			if (!isCreator && !isAdmin) {
				return interaction.reply({ 
					content: '❌ You do not have permission to stop this reminder. Only the creator or an Administrator can stop it.', 
					ephemeral: true 
				});
			}

			// Mark as notified so the scheduler stops checking it, but keep it in database for the template
			reminder.notified = true;
			try {
				fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
			} catch (e) {
				console.error('Failed to save reminders file after stop:', e);
				return interaction.reply({ content: '❌ Failed to save changes.', ephemeral: true });
			}

			// Update the original message to remove the stop button, show "Do It Again" button, and indicate it has stopped
			const oldEmbeds = interaction.message.embeds.map(e => EmbedBuilder.from(e));
			if (oldEmbeds[0]) {
				const statusFieldIndex = oldEmbeds[0].data.fields?.findIndex(f => f.name === 'ℹ️ Status' || f.name === '⏹️ Stopped');
				if (statusFieldIndex !== undefined && statusFieldIndex !== -1) {
					oldEmbeds[0].data.fields[statusFieldIndex].name = '⏹️ Stopped';
					oldEmbeds[0].data.fields[statusFieldIndex].value = `Stopped by <@${interaction.user.id}>`;
				} else {
					oldEmbeds[0].addFields({ name: '⏹️ Stopped', value: `Stopped by <@${interaction.user.id}>` });
				}
				oldEmbeds[0].setColor('#cccccc');
			}

			const againButton = new ButtonBuilder()
				.setCustomId(`reminder_again_${reminder.id}`)
				.setLabel('Do It Again')
				.setStyle(ButtonStyle.Primary);
			const components = [new ActionRowBuilder().addComponents(againButton)];

			try {
				await interaction.update({
					embeds: oldEmbeds,
					components: components
				});
			} catch (err) {
				console.error('Failed to update trigger message:', err);
			}

			await interaction.followUp({
				content: `✅ The recurring reminder **"${reminder.name}"** has been stopped.`,
				ephemeral: false
			});
			return;
		}

		if (interaction.customId.startsWith('reminder_again_')) {
			const reminderId = interaction.customId.replace('reminder_again_', '');
			
			if (!fs.existsSync(dataPath)) {
				return interaction.reply({ content: '❌ No reminders found.', ephemeral: true });
			}

			let data;
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				return interaction.reply({ content: '❌ Failed to load reminders database.', ephemeral: true });
			}

			const reminder = data.reminders?.find(r => r.id === reminderId);
			if (!reminder) {
				return interaction.reply({ content: '❌ Could not find this reminder\'s template. It might have been deleted or is too old.', ephemeral: true });
			}

			// Show the normal reminder_modal, prepopulated
			const modal = new ModalBuilder()
				.setCustomId('reminder_modal')
				.setTitle('Create a Reminder');

			const nameInput = new TextInputBuilder()
				.setCustomId('reminder_name')
				.setStyle(TextInputStyle.Short)
				.setValue(reminder.name)
				.setRequired(true)
				.setMaxLength(100);

			const nameLabel = new LabelBuilder()
				.setLabel('Reminder Title')
				.setTextInputComponent(nameInput);

			const descInput = new TextInputBuilder()
				.setCustomId('reminder_description')
				.setStyle(TextInputStyle.Paragraph)
				.setValue(reminder.description || '')
				.setRequired(false)
				.setMaxLength(1000);

			const descLabel = new LabelBuilder()
				.setLabel('Description (Optional)')
				.setTextInputComponent(descInput);

			const timeInput = new TextInputBuilder()
				.setCustomId('reminder_time')
				.setStyle(TextInputStyle.Short)
				.setPlaceholder('e.g., 30m, 1h, tomorrow 14:30, or type "custom"')
				.setRequired(true)
				.setMaxLength(100);

			const timeLabel = new LabelBuilder()
				.setLabel('When? (e.g. 1h, tomorrow 14:30, or custom)')
				.setTextInputComponent(timeInput);

			const mentionsSelect = new MentionableSelectMenuBuilder()
				.setCustomId('reminder_mentions')
				.setMinValues(1)
				.setMaxValues(10)
				.setRequired(true);

			if (reminder.mentions) {
				for (const mention of reminder.mentions) {
					const id = mention.replace(/[<@!&>]/g, '');
					if (mention.includes('&')) {
						mentionsSelect.addDefaultRoles(id);
					} else {
						mentionsSelect.addDefaultUsers(id);
					}
				}
			}

			const mentionsLabel = new LabelBuilder()
				.setLabel('Who to mention? (At least 1 user)')
				.setMentionableSelectMenuComponent(mentionsSelect);

			const repeatInput = new TextInputBuilder()
				.setCustomId('reminder_repeat')
				.setStyle(TextInputStyle.Short)
				.setValue(reminder.repeatRaw || '')
				.setRequired(false)
				.setMaxLength(50);

			const repeatLabel = new LabelBuilder()
				.setLabel('Repeat? (daily, weekly, 30m, or leave empty)')
				.setTextInputComponent(repeatInput);

			modal.addComponents(nameLabel, descLabel, timeLabel, mentionsLabel, repeatLabel);
			await interaction.showModal(modal);
			return;
		}

		if (interaction.customId.startsWith('reminder_edit_')) {
			const reminderId = interaction.customId.replace('reminder_edit_', '');

			if (!fs.existsSync(dataPath)) {
				return interaction.reply({ content: '❌ No reminders found.', ephemeral: true });
			}

			let data;
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				return interaction.reply({ content: '❌ Failed to load reminders database.', ephemeral: true });
			}

			const reminder = data.reminders?.find(r => r.id === reminderId);
			if (!reminder) {
				return interaction.reply({ content: '❌ This reminder does not exist.', ephemeral: true });
			}

			// Show the edit modal
			const modal = new ModalBuilder()
				.setCustomId(`reminder_editmodal_${reminder.id}`)
				.setTitle('Configure Reminder');

			const nameInput = new TextInputBuilder()
				.setCustomId('reminder_name')
				.setStyle(TextInputStyle.Short)
				.setValue(reminder.name)
				.setRequired(true)
				.setMaxLength(100);

			const nameLabel = new LabelBuilder()
				.setLabel('Reminder Title')
				.setTextInputComponent(nameInput);

			const descInput = new TextInputBuilder()
				.setCustomId('reminder_description')
				.setStyle(TextInputStyle.Paragraph)
				.setValue(reminder.description || '')
				.setRequired(false)
				.setMaxLength(1000);

			const descLabel = new LabelBuilder()
				.setLabel('Description (Optional)')
				.setTextInputComponent(descInput);

			const timeInput = new TextInputBuilder()
				.setCustomId('reminder_time')
				.setStyle(TextInputStyle.Short)
				.setValue(formatLocalTime(reminder.time))
				.setRequired(true)
				.setMaxLength(100);

			const timeLabel = new LabelBuilder()
				.setLabel('When? (e.g. 1h, tomorrow 14:30, or custom)')
				.setTextInputComponent(timeInput);

			const mentionsSelect = new MentionableSelectMenuBuilder()
				.setCustomId('reminder_mentions')
				.setMinValues(1)
				.setMaxValues(10)
				.setRequired(true);

			if (reminder.mentions) {
				for (const mention of reminder.mentions) {
					const id = mention.replace(/[<@!&>]/g, '');
					if (mention.includes('&')) {
						mentionsSelect.addDefaultRoles(id);
					} else {
						mentionsSelect.addDefaultUsers(id);
					}
				}
			}

			const mentionsLabel = new LabelBuilder()
				.setLabel('Who to mention? (At least 1 user)')
				.setMentionableSelectMenuComponent(mentionsSelect);

			const repeatInput = new TextInputBuilder()
				.setCustomId('reminder_repeat')
				.setStyle(TextInputStyle.Short)
				.setValue(reminder.repeatRaw || '')
				.setRequired(false)
				.setMaxLength(50);

			const repeatLabel = new LabelBuilder()
				.setLabel('Repeat? (daily, weekly, 30m, or leave empty)')
				.setTextInputComponent(repeatInput);

			modal.addComponents(nameLabel, descLabel, timeLabel, mentionsLabel, repeatLabel);
			await interaction.showModal(modal);
			return;
		}

		if (interaction.customId === 'reminder_cancel_edit') {
			await interaction.update({
				content: '❌ Rescheduling cancelled.',
				embeds: [],
				components: []
			});
			return;
		}
	},

	/**
	 * Starts the background interval checking for triggered reminders.
	 */
	startScheduler(client) {
		setInterval(async () => {
			if (!fs.existsSync(dataPath)) return;

			let data;
			try {
				data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			} catch (e) {
				return;
			}

			if (!data || !data.reminders || data.reminders.length === 0) return;

			const targetChannelId = '1507275846270845078';
			// Safe fetch of channel
			const channel = client.channels.cache.get(targetChannelId) || await client.channels.fetch(targetChannelId).catch(() => null);
			if (!channel) {
				console.error(`Reminder scheduler could not find channel with ID ${targetChannelId}`);
				return;
			}

			const now = Date.now();
			let changed = false;
			const remindersToKeep = [];
			const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

			// Clean up notified reminders older than 7 days
			const activeAndRecentReminders = data.reminders.filter(r => !r.notified || r.time > sevenDaysAgo);
			if (activeAndRecentReminders.length !== data.reminders.length) {
				changed = true;
			}

			for (const reminder of activeAndRecentReminders) {
				if (!reminder.notified && now >= reminder.time) {
					// 1. Edit the older message to remove button and update status
					if (reminder.lastMessageId && reminder.lastChannelId) {
						await updateOlderMessage(client, reminder.lastChannelId, reminder.lastMessageId, 'Already notified');
					}

					// 2. Build the mention notification list (deduplicate user pings)
					const pingList = [...new Set(reminder.mentions)];

					const embed = new EmbedBuilder()
						.setTitle(`🔔 Reminder: ${reminder.name}`)
						.setColor('#ffaa00')
						.setTimestamp();

					if (reminder.description) {
						embed.setDescription(reminder.description);
					}

					embed.addFields({ name: '👤 Created By', value: `<@${reminder.userId}>`, inline: true });
					if (reminder.mentions && reminder.mentions.length > 0) {
						embed.addFields({ name: '👥 Mentions', value: reminder.mentions.join(' '), inline: true });
					}

					const components = [];
					let nextTime = null;

					if (reminder.repeat) {
						nextTime = getNextTriggerTime(reminder.time, reminder.repeat);
						embed.addFields({ name: '🔄 Repeat', value: `This reminder repeats \`${reminder.repeatRaw}\``, inline: true });
						if (nextTime) {
							embed.addFields({ 
								name: '⏰ Next Notification', 
								value: `<t:${Math.floor(nextTime / 1000)}:F> (<t:${Math.floor(nextTime / 1000)}:R>)`, 
								inline: true 
							});
						}

						const stopButton = new ButtonBuilder()
							.setCustomId(`reminder_stop_${reminder.id}`)
							.setLabel('Stop Repeating')
							.setStyle(ButtonStyle.Danger);
						
						components.push(new ActionRowBuilder().addComponents(stopButton));
					} else {
						// One-time reminder: add "Do It Again" button
						const againButton = new ButtonBuilder()
							.setCustomId(`reminder_again_${reminder.id}`)
							.setLabel('Do It Again')
							.setStyle(ButtonStyle.Primary);
						
						components.push(new ActionRowBuilder().addComponents(againButton));
					}

					// 3. Send ping message to the target channel
					let sentMsg = null;
					try {
						sentMsg = await channel.send({
							content: pingList.join(' '),
							embeds: [embed],
							components: components
						});
					} catch (err) {
						console.error(`Failed to send reminder ${reminder.id}:`, err);
					}

					// 4. Handle repeating updates & track newest message
					if (reminder.repeat && nextTime) {
						reminder.time = nextTime;
						if (sentMsg) {
							reminder.lastMessageId = sentMsg.id;
							reminder.lastChannelId = sentMsg.channelId;
						}
						remindersToKeep.push(reminder);
						changed = true;
					} else {
						// One-time reminder: mark as notified and keep it in database for templates
						reminder.notified = true;
						if (sentMsg) {
							reminder.lastMessageId = sentMsg.id;
							reminder.lastChannelId = sentMsg.channelId;
						}
						remindersToKeep.push(reminder);
						changed = true;
					}
				} else {
					remindersToKeep.push(reminder);
				}
			}

			if (changed) {
				data.reminders = remindersToKeep;
				try {
					fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
				} catch (e) {
					console.error('Failed to save updated reminders list:', e);
				}
			}
		}, 10000); // 10-second check interval
	}
};
