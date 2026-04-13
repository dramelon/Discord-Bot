const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageCollector, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isAdmin } = require('../../utils/adminCheck');
const { processImage } = require('../../utils/imageProcessor');
const { syncToDiscord, getStickers, saveStickers } = require('../../utils/stickerSync');

const STICKERS_DIR = path.join(process.cwd(), 'data', 'customStickers', 'files');
const DATA_FILE = path.join(process.cwd(), 'data', 'customStickers', 'stickers.json');

// Ensure directories exist
if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

// Utility functions removed as they are now imported from stickerSync.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticker')
        .setDescription('Custom sticker system')
        .addSubcommand(subcommand =>
            subcommand.setName('upload')
                .setDescription('Upload a new sticker (Static or Animated)')
                .addStringOption(option => option.setName('name').setDescription('Sticker name'))
                .addStringOption(option => option.setName('url').setDescription('Image URL')))
        .addSubcommand(subcommand =>
            subcommand.setName('list')
                .setDescription('List all stickers'))
        .addSubcommand(subcommand =>
            subcommand.setName('use')
                .setDescription('Send a sticker')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Sticker name')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('remove')
                .setDescription('Remove a sticker')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Sticker name')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('rename')
                .setDescription('Rename a sticker')
                .addStringOption(option =>
                    option.setName('old_name')
                        .setDescription('Original name')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('new_name')
                        .setDescription('New name')
                        .setRequired(true))),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const stickers = getStickers();
        let subcommand = null;
        try { subcommand = interaction.options.getSubcommand(false); } catch (e) {}

        let filtered;
        if (subcommand === 'remove' || subcommand === 'rename') {
            // Restriction logic for autocomplete if needed, but user said everyone can see all stickers in list
            // For removal/rename, usually you only want to see what you can edit.
            // But user said: "If user id ... or role ... will see all the sticker list"
            const isUserAdmin = isAdmin(interaction.member || interaction.user);
            filtered = stickers.filter(s => isUserAdmin || s.authorId === interaction.user.id);
        } else {
            filtered = stickers;
        }

        const choices = filtered
            .filter(s => s.name.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(choices.map(s => ({ name: s.name, value: s.name })));
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'upload') {
            await this.handleUpload(interaction);
        } else if (subcommand === 'list') {
            await this.handleList(interaction);
        } else if (subcommand === 'use') {
            await this.handleUse(interaction);
        } else if (subcommand === 'remove') {
            await this.handleRemove(interaction);
        } else if (subcommand === 'rename') {
            await this.handleRename(interaction);
        }
    },

    async handleUpload(interaction) {
        let name = interaction.options.getString('name');
        let url = interaction.options.getString('url');

        // Guided mode if params missing
        if (!name || !url) {
            await interaction.reply({ content: 'Guided Upload: Please send the **Name** and the **Attachment/URL** in separate messages or follow the prompts.', ephemeral: true });
            
            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 2 });

            let step = name ? 1 : 0; // 0: Need name, 1: Need URL
            if (!name) await interaction.followUp({ content: 'What should be the **name** of the sticker?', ephemeral: true });
            else await interaction.followUp({ content: `Got the name: \`${name}\`. Now please send the **image/gif** (attachment or URL).`, ephemeral: true });

            collector.on('collect', async m => {
                if (step === 0) {
                    name = m.content.trim();
                    if (!name) return m.reply('Invalid name. try again.');
                    step = 1;
                    await m.reply('Got it. Now send the **image/gif**.');
                } else if (step === 1) {
                    url = m.attachments.first()?.url || m.content.trim();
                    if (!url) return m.reply('No URL or attachment found. Try again.');
                    collector.stop('done');
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'done') {
                    await this.performUpload(interaction, name, url);
                } else {
                    await interaction.followUp({ content: 'Upload timed out or cancelled.', ephemeral: true });
                }
            });
            return;
        }

        await this.performUpload(interaction, name, url);
    },

    async performUpload(interaction, name, url) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
        
        try {
            const stickers = getStickers();
            if (stickers.some(s => s.name === name)) {
                return interaction.editReply(`Sticker with name \`${name}\` already exists.`);
            }

            const { filename } = await processImage(url, STICKERS_DIR, name);

            const newSticker = {
                name,
                filename,
                authorId: interaction.user.id,
                createdAt: Date.now()
            };

            newSticker.lastUsedAt = Date.now();
            newSticker.discordStickerId = null;

            stickers.push(newSticker);
            saveStickers(stickers);

            // Sync to Discord target guild
            await syncToDiscord(interaction.client, name);

            await interaction.editReply(`Successfully uploaded sticker: **${name}** (Synced to target server)`);
        } catch (error) {
            await interaction.editReply(`Error processing sticker: ${error.message}`);
        }
    },

    async handleList(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
        const stickers = getStickers();
        if (stickers.length === 0) {
            return interaction.editReply('No stickers found.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Custom Stickers')
            .setDescription(stickers.map(s => `• \`${s.name}\``).join('\n').slice(0, 4000))
            .setColor(0x00AE86);

        await interaction.editReply({ embeds: [embed] });
    },

    async handleUse(interaction) {
        // Defer ephemerally so the "Sticker sent" message is hidden from others
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

        const name = interaction.options.getString('name');
        const stickers = getStickers();
        const sticker = stickers.find(s => s.name === name);

        if (!sticker) {
            return interaction.editReply({ content: `Sticker \`${name}\` not found.`, ephemeral: true });
        }

        const sorted = [...stickers].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
        
        // Sync logic: Sync if order changes OR if the sticker somehow lost its Discord ID
        const isAlreadyTop = sorted.length > 0 && sorted[0].name === name;
        if (!isAlreadyTop || !sticker.discordStickerId) {
            await syncToDiscord(interaction.client, name);
        }

        // Re-fetch to get any newly created discordStickerId
        const updatedStickers = getStickers();
        const updatedSticker = updatedStickers.find(s => s.name === name);

        const isTargetGuild = interaction.guildId === '1492101995094610062';

        if (isTargetGuild && updatedSticker && updatedSticker.discordStickerId) {
            try {
                await interaction.channel.send({ stickers: [updatedSticker.discordStickerId] });
                return await interaction.editReply({ content: `Sent sticker: **${name}**` });
            } catch (e) {
                console.error('Failed to send real sticker separately:', e);
            }
        }

        const filePath = path.join(STICKERS_DIR, updatedSticker.filename);
        if (!fs.existsSync(filePath)) {
            return interaction.editReply({ content: `Sticker file missing!`, ephemeral: true });
        }

        const attachment = new AttachmentBuilder(filePath);
        try {
            await interaction.channel.send({ files: [attachment] });
            await interaction.editReply({ content: `Sent sticker: **${name}**` });
        } catch (e) {
            console.error('Failed to send sticker file:', e);
            await interaction.editReply({ content: 'Failed to send sticker. Please check my permissions.' });
        }
    },

    async handleRemove(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

        const name = interaction.options.getString('name');
        const stickers = getStickers();
        const index = stickers.findIndex(s => s.name === name);

        if (index === -1) {
            return interaction.editReply({ content: 'Sticker not found.', ephemeral: true });
        }

        const sticker = stickers[index];
        const isUserAdmin = isAdmin(interaction.member || interaction.user);

        if (!isUserAdmin && sticker.authorId !== interaction.user.id) {
            return interaction.editReply({ content: 'You are not allowed to remove this sticker.', ephemeral: true });
        }

        // Delete file
        const filePath = path.join(STICKERS_DIR, sticker.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // Delete from Discord if present
        if (sticker.discordStickerId) {
            try {
                const guild = await interaction.client.guilds.fetch('1492101995094610062');
                if (guild) await guild.stickers.delete(sticker.discordStickerId, 'Sticker removed by user');
            } catch (e) {
                console.error('Failed to delete from Discord guild:', e);
            }
        }

        stickers.splice(index, 1);
        saveStickers(stickers);

        await interaction.editReply(`Removed sticker \`${name}\`.`);
    },

    async handleRename(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

        const oldName = interaction.options.getString('old_name');
        const newName = interaction.options.getString('new_name');
        const stickers = getStickers();
        const index = stickers.findIndex(s => s.name === oldName);

        if (index === -1) {
            return interaction.editReply({ content: 'Sticker not found.', ephemeral: true });
        }

        const sticker = stickers[index];
        const isUserAdmin = isAdmin(interaction.member || interaction.user);

        if (!isUserAdmin && sticker.authorId !== interaction.user.id) {
            return interaction.editReply({ content: 'You are not allowed to rename this sticker.', ephemeral: true });
        }

        if (stickers.some(s => s.name === newName)) {
            return interaction.editReply({ content: `Name \`${newName}\` already taken.`, ephemeral: true });
        }

        const oldId = sticker.discordStickerId;
        sticker.name = newName;
        saveStickers(stickers);

        // Update on Discord if active
        if (oldId) {
            try {
                const guild = await interaction.client.guilds.fetch('1492101995094610062');
                if (guild) await guild.stickers.edit(oldId, { name: newName });
            } catch (e) {
                console.error('Failed to rename on Discord guild:', e);
            }
        }

        await interaction.editReply(`Renamed sticker \`${oldName}\` to \`${newName}\`.`);
    }
};
