const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Steal an emoji or sticker and upload it to this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addSubcommand(subcommand =>
            subcommand.setName('emoji')
                .setDescription('Steal an emoji')
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('The emoji to steal (Custom emoji or ID)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name to give the new emoji (optional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand.setName('sticker')
                .setDescription('Steal a sticker (send a URL or leave blank and the bot will wait for you to send one)')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('The sticker URL or ID (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name to give the new sticker (optional)')
                        .setRequired(false))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        if (subcommand === 'emoji') {
            const emojiInput = interaction.options.getString('emoji').trim();
            const requestedName = interaction.options.getString('name');

            const customMatch = emojiInput.match(/<(a)?:(.+?):(\d+)>/);
            const idMatch = emojiInput.match(/^\d{17,20}$/);

            let url;
            let finalName = requestedName;

            if (customMatch) {
                const isAnimated = !!customMatch[1];
                const originalName = customMatch[2];
                const id = customMatch[3];
                url = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? 'gif' : 'png'}`;
                if (!finalName) finalName = originalName;
            } else if (idMatch) {
                const id = idMatch[0];
                url = `https://cdn.discordapp.com/emojis/${id}.png`; // Might be gif, but we can't tell easily without fetching. We'll try webp/png.
                if (!finalName) finalName = 'stolen_emoji';
            } else {
                return interaction.editReply('Invalid emoji format. Please provide a custom emoji (e.g., `<:name:id>`) or an emoji ID.');
            }

            try {
                const emoji = await interaction.guild.emojis.create({ attachment: url, name: finalName });
                await interaction.editReply(`Successfully stolen as emoji: ${emoji} (\`${emoji.name}\`)`);
            } catch (error) {
                console.error(error);
                await interaction.editReply(`Failed to create emoji: ${error.message}`);
            }
        } else if (subcommand === 'sticker') {
            let url = interaction.options.getString('url');
            let finalName = interaction.options.getString('name') || 'stolen_sticker';
            let description = 'Stolen sticker';

            if (!url) {
                await interaction.editReply({ content: 'Please send or reply with the sticker you want to steal... (60s remaining)' });
                
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

                url = sticker.url;
                if (!interaction.options.getString('name')) finalName = sticker.name;
                description = sticker.description || description;

                try {
                    if (firstMsg.deletable) await firstMsg.delete();
                } catch (e) {
                    console.error('Failed to delete sticker message:', e);
                }
            } else {
                // If it's a raw ID
                const idMatch = url.match(/^\d{17,20}$/);
                if (idMatch) {
                    url = `https://media.discordapp.net/stickers/${idMatch[0]}.png`;
                }
            }

            try {
                await interaction.editReply({ content: 'Uploading sticker to server...' });
                const newSticker = await interaction.guild.stickers.create({
                    file: url,
                    name: finalName,
                    tags: finalName
                });
                await interaction.editReply(`Successfully stolen sticker: **${newSticker.name}**`);
            } catch (error) {
                console.error(error);
                await interaction.editReply(`Failed to create sticker: ${error.message}`);
            }
        }
    }
};
