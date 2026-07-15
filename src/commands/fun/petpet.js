const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generatePetPet } = require('../../utils/petpet');

// Size choices mapped to pixels
const sizeMap = {
    'tiny': 56,
    'extra_tiny': 28,
    'small': 112,
    'medium': 224,
    'big': 336,
    'huge': 448
};

function addCommonOptions(subcommand) {
    return subcommand
        .addNumberOption(option =>
            option.setName('speed')
                .setDescription('Speed multiplier (0.5-4, 4=🔥, default: 1.0)')
                .setMinValue(0.5)
                .setMaxValue(4.0)
                .setRequired(false))
        .addNumberOption(option =>
            option.setName('squeeze')
                .setDescription('Squeeze intensity (0-5, default: 1.0)')
                .setMinValue(0)
                .setMaxValue(5)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('size')
                .setDescription('Size of the petpet (default: medium)')
                .addChoices(
                    { name: 'Extra Tiny (28x28)', value: 'extra_tiny' },
                    { name: 'Tiny (56x56)', value: 'tiny' },
                    { name: 'Small (112x112)', value: 'small' },
                    { name: 'Medium (224x224)', value: 'medium' },
                    { name: 'Big (336x336)', value: 'big' },
                    { name: 'Huge (448x448)', value: 'huge' }
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('self_view')
                .setDescription('Whether the result is only visible to you (default: false)')
                .setRequired(false));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('petpet')
        .setDescription('Generate a petpet GIF!')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1])
        // Subcommand: image_upload
        .addSubcommand(subcommand => {
            subcommand.setName('image_upload')
                .setDescription('Upload an image to convert to petpet')
                .addAttachmentOption(option =>
                    option.setName('attachment')
                        .setDescription('The image to petpet')
                        .setRequired(true));
            return addCommonOptions(subcommand);
        })
        // Subcommand: url
        .addSubcommand(subcommand => {
            subcommand.setName('url')
                .setDescription('Use an image URL to convert to petpet')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('The image URL to petpet')
                        .setRequired(true));
            return addCommonOptions(subcommand);
        })
        // Subcommand: user
        .addSubcommand(subcommand => {
            subcommand.setName('user')
                .setDescription('Petpet a user!')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('The user to petpet')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('use_server_avatar')
                        .setDescription('Use the server-specific avatar (default: true). Falls back to main profile if unavailable.')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('notify_user')
                        .setDescription('Whether to display "@user1 petting @user2" (default: true)')
                        .setRequired(false));
            return addCommonOptions(subcommand);
        })
        // Subcommand: emoji
        .addSubcommand(subcommand => {
            subcommand.setName('emoji')
                .setDescription('Petpet an emoji!')
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('The emoji to petpet (Custom, Unicode, or ID)')
                        .setRequired(true));
            return addCommonOptions(subcommand);
        })
        // Subcommand: sticker
        .addSubcommand(subcommand => {
            subcommand.setName('sticker')
                .setDescription('Petpet a sticker! (The bot will wait for you to send a sticker)');
            return addCommonOptions(subcommand);
        }),

    async execute(interaction) {
        const selfView = interaction.options.getBoolean('self_view') ?? false;
        await interaction.deferReply({ ephemeral: selfView });

        const subcommand = interaction.options.getSubcommand();
        const speed = interaction.options.getNumber('speed') || 1;
        const squeeze = interaction.options.getNumber('squeeze') || 1;
        const sizeKey = interaction.options.getString('size') || 'medium';
        const canvasSize = sizeMap[sizeKey];
        
        let source;
        let notificationText = '';

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
                const targetUser = interaction.options.getUser('target');
                const targetMember = interaction.options.getMember('target');
                const useServerAvatar = interaction.options.getBoolean('use_server_avatar') ?? true;
                const notify = interaction.options.getBoolean('notify_user') ?? true;

                if (useServerAvatar && targetMember && typeof targetMember.displayAvatarURL === 'function') {
                    source = targetMember.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
                } else {
                    source = targetUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
                }

                if (notify) {
                    notificationText = `${interaction.user} is petting ${targetUser}!`;
                }
            } else if (subcommand === 'emoji') {
                const emojiInput = interaction.options.getString('emoji').trim();
                
                const customMatch = emojiInput.match(/<a?:.+?:(\d+)>/);
                const unicodeMatches = emojiInput.match(/\p{Emoji_Presentation}/gu);
                const idMatch = emojiInput.match(/^\d{17,20}$/);

                if (customMatch) {
                    const textWithoutCustom = emojiInput.replace(/<a?:.+?:\d+>/g, '').trim();
                    if (textWithoutCustom && !/\p{Emoji_Presentation}/u.test(textWithoutCustom)) {
                        return interaction.editReply({ content: 'Invalid input. Please provide only emojis.' });
                    }
                    source = `https://cdn.discordapp.com/emojis/${customMatch[1]}.png`;
                } else if (unicodeMatches) {
                    const textWithoutUnicode = emojiInput.replace(/\p{Emoji_Presentation}/gu, '').trim();
                    if (textWithoutUnicode) {
                        return interaction.editReply({ content: 'Invalid input. Please provide only emojis.' });
                    }
                    const codePoints = [...unicodeMatches[0]].map(c => c.codePointAt(0).toString(16)).join('-');
                    source = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png`;
                } else if (idMatch) {
                    source = `https://cdn.discordapp.com/emojis/${emojiInput}.png`;
                } else {
                    return interaction.editReply({ content: 'Invalid emoji. Please provide a custom emoji, Unicode emoji, or emoji ID.' });
                }
            } else if (subcommand === 'sticker') {
                await interaction.editReply({ content: 'Please send or reply with the sticker you want to petpet... (60s remaining)' });
                
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

                await interaction.editReply({ content: 'Sticker received! Generating petpet...' });
            }

            await generatePetpetFromSource(interaction, source, speed, squeeze, canvasSize, notificationText);
        } catch (error) {
            console.error('Error generating petpet:', error);
            const errorMessage = error.message?.includes('decode') || error.message?.includes('load') || error.message?.includes('JSON')
                ? 'Failed to process this specific sticker/image (it may be an unsupported Lottie format).'
                : 'Failed to generate petpet. Make sure the source is a valid image/emoji/sticker.';
            
            await interaction.editReply({ 
                content: errorMessage,
                files: [] 
            });
        }
    },
    generatePetpetFromSource,
};

async function generatePetpetFromSource(interaction, source, speed, squeeze, canvasSize, notificationText) {
    const petpetGif = await generatePetPet(source, speed, squeeze, canvasSize);
    const attachment = new AttachmentBuilder(petpetGif, { name: 'petpet.gif' });

    await interaction.editReply({ 
        content: notificationText || null,
        files: [attachment] 
    });
}
