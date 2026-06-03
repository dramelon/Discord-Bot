const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, Collection } = require('discord.js');

/**
 * Parses a duration string like "10m", "1h", "1d" into milliseconds.
 * @param {string} str 
 * @returns {number|null}
 */
function parseDuration(str) {
    const match = str.match(/^(\d+)([mhd])$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

/**
 * Truncates text to a specific length and adds ellipsis if needed.
 * @param {string} text 
 * @param {number} length 
 * @returns {string}
 */
function truncate(text, length = 100) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

/**
 * Fetches up to `limit` messages from a channel.
 * @param {TextChannel} channel 
 * @param {number} limit 
 * @returns {Promise<Collection<string, Message>>}
 */
async function fetchMessages(channel, limit) {
    let fetched = new Collection();
    let lastId = null;

    while (fetched.size < limit) {
        const remaining = limit - fetched.size;
        const fetchLimit = Math.min(remaining, 100);
        
        const options = { limit: fetchLimit };
        if (lastId) {
            options.before = lastId;
        }

        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;

        fetched = fetched.concat(messages);
        lastId = messages.lastKey();

        if (messages.size < fetchLimit) break;
    }

    return fetched;
}

/**
 * Safely bulk deletes messages in chunks of 100.
 * @param {TextChannel} channel 
 * @param {Collection<string, Message>|Array<Message>} messages 
 */
async function safeBulkDelete(channel, messages) {
    const messageArray = Array.from(messages.values ? messages.values() : messages);
    const chunkSize = 100;
    for (let i = 0; i < messageArray.length; i += chunkSize) {
        const chunk = messageArray.slice(i, i + chunkSize);
        await channel.bulkDelete(chunk, true);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearmessage')
        .setDescription('Clear messages guild-wide based on criteria')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('user')
                .setDescription('Clear messages from a specific user')
                .addUserOption(opt => opt.setName('user').setDescription('The user whose messages to delete').setRequired(true))
                .addStringOption(opt => opt.setName('duration').setDescription('Look-back duration (e.g., 10m, 1h, 1d)').setRequired(true))
                .addChannelOption(opt => opt.setName('channel').setDescription('Specific channel to clear (default: all)').addChannelTypes(ChannelType.GuildText))
                .addIntegerOption(opt => opt.setName('limit').setDescription('Max messages to scan per channel (default: 100)').setMinValue(1).setMaxValue(1000))
        )
        .addSubcommand(sub =>
            sub.setName('message')
                .setDescription('Clear messages containing specific text')
                .addStringOption(opt => opt.setName('context').setDescription('Text to search for').setRequired(true))
                .addStringOption(opt => opt.setName('duration').setDescription('Look-back duration (e.g., 10m, 1h, 1d)').setRequired(true))
                .addBooleanOption(opt => opt.setName('matching').setDescription('If true, must be an exact match'))
                .addChannelOption(opt => opt.setName('channel').setDescription('Specific channel to clear (default: all)').addChannelTypes(ChannelType.GuildText))
                .addIntegerOption(opt => opt.setName('limit').setDescription('Max messages to scan per channel (default: 100)').setMinValue(1).setMaxValue(1000))
        )
        .addSubcommand(sub =>
            sub.setName('channel')
                .setDescription('Clear messages in a specific channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('The channel to clear').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addStringOption(opt => opt.setName('time').setDescription('Look-back duration (e.g., 10m, 1h, 1d) (default: 1h)').setRequired(false))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete (default: 20)').setRequired(false).setMinValue(1).setMaxValue(1000))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        let durationStr;
        let durationMs;
        let scanLimit;
        let targetChannel;

        if (subcommand === 'channel') {
            targetChannel = interaction.options.getChannel('channel');
            durationStr = interaction.options.getString('time') || '1h';
            durationMs = parseDuration(durationStr);
            scanLimit = interaction.options.getInteger('amount') ?? 20;
        } else {
            durationStr = interaction.options.getString('duration');
            durationMs = parseDuration(durationStr);
            scanLimit = interaction.options.getInteger('limit') || 100;
            targetChannel = interaction.options.getChannel('channel');
        }

        if (!durationMs) {
            return interaction.reply({ content: '❌ Invalid duration format. Use e.g., `10m`, `1h`, `1d`.', ephemeral: true });
        }

        const reply = await interaction.deferReply({ fetchReply: true });

        const cutoff = Date.now() - durationMs;
        let totalDeleted = 0;
        const deletedStats = new Map(); // content -> count
        let targetUser = null;

        if (subcommand === 'user') {
            targetUser = interaction.options.getUser('user');
        }

        const context = interaction.options.getString('context');
        const exactMatch = interaction.options.getBoolean('matching') || false;

        // Determine which channels to scan
        const channelsToScan = targetChannel 
            ? [targetChannel] 
            : Array.from(interaction.guild.channels.cache.filter(c => c.isTextBased()).values());

        for (const channel of channelsToScan) {
            try {
                // Ensure bot has permissions
                const permissions = channel.permissionsFor(interaction.client.user);
                if (!permissions || !permissions.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.ManageMessages)) {
                    continue;
                }

                const messages = await fetchMessages(channel, scanLimit);
                const toDelete = messages.filter(msg => {
                    // Do not delete the bot's own interaction reply message
                    if (reply && msg.id === reply.id) return false;

                    // Check duration
                    if (msg.createdTimestamp < cutoff) return false;
                    
                    // Logic for "user" subcommand
                    if (subcommand === 'user') {
                        return msg.author.id === targetUser.id;
                    }

                    // Logic for "message" subcommand
                    if (subcommand === 'message') {
                        const content = msg.content;
                        if (exactMatch) {
                            return content === context;
                        } else {
                            return content.toLowerCase().includes(context.toLowerCase());
                        }
                    }

                    // Logic for "channel" subcommand
                    if (subcommand === 'channel') {
                        return true;
                    }

                    return false;
                });

                if (toDelete.size > 0) {
                    // Collect stats
                    toDelete.forEach(msg => {
                        const truncatedContent = truncate(msg.content);
                        deletedStats.set(truncatedContent, (deletedStats.get(truncatedContent) || 0) + 1);
                    });

                    // Bulk delete
                    await safeBulkDelete(channel, toDelete);
                    totalDeleted += toDelete.size;
                }
            } catch (error) {
                console.error(`Error scanning channel ${channel.id}:`, error);
            }
        }

        // Build report
        const embed = new EmbedBuilder()
            .setTitle('🧹 Message Cleanup Complete')
            .setColor(0x3498db)
            .setTimestamp();

        if (totalDeleted === 0) {
            embed.setDescription(`No messages found matching the criteria in the last **${durationStr}**.`);
        } else {
            let description = `Successfully cleared **${totalDeleted}** messages from **${durationStr}** look-back.\n\n`;
            
            if (subcommand === 'user') {
                description += `👤 **Target User:** ${targetUser}\n`;
            } else if (subcommand === 'message') {
                description += `🔍 **Search Context:** "${truncate(context, 50)}"\n`;
                description += `📏 **Match Mode:** ${exactMatch ? 'Exact' : 'Contains'}\n\n`;
                
                description += `**Detailed Breakdown:**\n`;
                const breakdown = Array.from(deletedStats.entries())
                    .map(([content, count]) => `- Deleted **${count}x** of "${content}"`)
                    .join('\n');
                
                description += truncate(breakdown, 1800); // Discord limit safety
            } else if (subcommand === 'channel') {
                description += `📺 **Target Channel:** ${targetChannel}\n`;
                description += `🔢 **Max Scan Amount:** ${scanLimit}\n`;
            }

            embed.setDescription(description);
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
