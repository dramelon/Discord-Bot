const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upload')
        .setDescription('Upload an emoji or sticker to this server via attachment or URL')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Are you uploading an emoji or sticker?')
                .setRequired(true)
                .addChoices(
                    { name: 'Emoji', value: 'emoji' },
                    { name: 'Sticker', value: 'sticker' }
                ))
        .addAttachmentOption(option =>
            option.setName('attachment')
                .setDescription('The image/gif file to upload')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the image/gif to upload')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The name to give the new emoji/sticker (optional)')
                .setRequired(false)),

    async execute(interaction) {
        const type = interaction.options.getString('type');
        const attachment = interaction.options.getAttachment('attachment');
        const urlParam = interaction.options.getString('url');
        let requestedName = interaction.options.getString('name');

        if (!attachment && !urlParam) {
            return interaction.reply({ content: 'You must provide either an **attachment** or a **url** to upload.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        let url = '';
        let finalName = requestedName;

        if (attachment) {
            url = attachment.url;
            if (!finalName) {
                // Remove extension from filename
                finalName = attachment.name.replace(/\.[^/.]+$/, "");
            }
        } else if (urlParam) {
            url = urlParam;
            if (!finalName) {
                try {
                    const parsedUrl = new URL(url);
                    const pathname = parsedUrl.pathname;
                    const parts = pathname.split('/');
                    const lastPart = parts[parts.length - 1];
                    if (lastPart) {
                        finalName = lastPart.replace(/\.[^/.]+$/, "");
                    }
                } catch (e) {
                    // Invalid URL format, will probably fail fetch but we set a fallback name
                }
            }
        }

        // Clean up name: Emojis can only be alphanumeric and underscores, min 2 chars
        if (!finalName) {
            finalName = `uploaded_${type}`;
        }
        
        // Emojis must be alphanumeric and underscores
        if (type === 'emoji') {
            finalName = finalName.replace(/[^a-zA-Z0-9_]/g, '_');
            if (finalName.length < 2) finalName = finalName + '_emoji';
        }

        try {
            if (type === 'emoji') {
                const newEmoji = await interaction.guild.emojis.create({ attachment: url, name: finalName });
                await interaction.editReply(`Successfully uploaded emoji: ${newEmoji} (\`${newEmoji.name}\`)`);
            } else if (type === 'sticker') {
                const newSticker = await interaction.guild.stickers.create({ file: url, name: finalName, tags: finalName });
                await interaction.editReply(`Successfully uploaded sticker: **${newSticker.name}**`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply(`Failed to upload ${type}: ${error.message}`);
        }
    }
};
