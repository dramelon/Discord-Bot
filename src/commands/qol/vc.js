const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getChannel, updateChannel } = require('../../utils/tempVCManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vc')
        .setDescription('Manage your temporary voice channel')
        .addSubcommand(subcommand =>
            subcommand
                .setName('name')
                .setDescription('Change the name of your voice channel')
                .addStringOption(option =>
                    option.setName('new_name')
                        .setDescription('The new name for the voice channel')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Allow a user to join your voice channel')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user\'s explicit access to your voice channel')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Kick a user from your voice channel and revoke their access')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to kick')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('invite')
                .setDescription('Invite a user to your voice channel via DM')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to invite')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('lock')
                .setDescription('Lock or unlock your voice channel')
                .addBooleanOption(option =>
                    option.setName('state')
                        .setDescription('True to lock, False to unlock')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
        }

        const vcData = getChannel(voiceChannel.id);
        if (!vcData) {
            return interaction.reply({ content: 'You must be in a temporary voice channel to use this command.', ephemeral: true });
        }

        const isOwner = (vcData.ownerId === member.id);
        const isLocked = vcData.locked;

        if (!isOwner && isLocked) {
            return interaction.reply({ content: 'This room is locked. Only the room owner can use commands.', ephemeral: true });
        }

        if (!isOwner && subcommand === 'lock') {
            return interaction.reply({ content: 'Only the room owner can lock or unlock the room.', ephemeral: true });
        }

        if (subcommand === 'name') {
            const rawName = interaction.options.getString('new_name');
            // Remove custom emojis: <:name:id> and <a:name:id>
            const cleanName = rawName.replace(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g, '').trim();
            
            if (!cleanName) {
                return interaction.reply({ content: 'The name cannot be empty after filtering out custom emojis.', ephemeral: true });
            }

            try {
                await voiceChannel.setName(cleanName);
                return interaction.reply({ content: `Voice channel name changed to **${cleanName}**.`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'Failed to change the channel name. Discord imposes strict rate limits (2 updates per 10 minutes) on channel renames.', ephemeral: true });
            }
        }

        if (subcommand === 'add') {
            const targetUser = interaction.options.getUser('user');
            
            try {
                await voiceChannel.permissionOverwrites.edit(targetUser.id, {
                    Connect: true,
                    ViewChannel: true
                });
                return interaction.reply({ content: `Added ${targetUser} to the room.`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'Failed to add the user.', ephemeral: true });
            }
        }

        if (subcommand === 'remove') {
            const targetUser = interaction.options.getUser('user');
            
            try {
                await voiceChannel.permissionOverwrites.delete(targetUser.id);
                return interaction.reply({ content: `Removed ${targetUser}'s explicit access to the room.`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'Failed to remove the user.', ephemeral: true });
            }
        }

        if (subcommand === 'kick') {
            const targetUser = interaction.options.getUser('user');
            
            try {
                // Deny access
                await voiceChannel.permissionOverwrites.edit(targetUser.id, {
                    Connect: false,
                    ViewChannel: false
                });

                // Disconnect if they are in the VC
                const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect();
                }

                return interaction.reply({ content: `Kicked ${targetUser} and revoked their access.`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'Failed to kick the user.', ephemeral: true });
            }
        }

        if (subcommand === 'invite') {
            const targetUser = interaction.options.getUser('user');
            
            try {
                // Grant access first
                await voiceChannel.permissionOverwrites.edit(targetUser.id, {
                    Connect: true,
                    ViewChannel: true
                });

                // Create invite
                const invite = await voiceChannel.createInvite({
                    maxAge: 3 * 60, // 3 minutes
                    maxUses: 1,
                    unique: true
                });

                // DM the user
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('Voice Channel Invite')
                    .setDescription(`${member} has invited you to join their temporary voice channel in **${interaction.guild.name}**!`)
                    .addFields({ name: 'Link', value: invite.url })
                    .setFooter({ text: 'This invite expires in 3 minutes.' });

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                    throw new Error("Cannot send DM");
                });

                return interaction.reply({ content: `Granted access and sent an invite link to ${targetUser} via DM.`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'Failed to invite the user. They might have DMs disabled.', ephemeral: true });
            }
        }

        if (subcommand === 'lock') {
            const state = interaction.options.getBoolean('state');
            
            try {
                if (state) {
                    // Lock: deny @everyone Connect
                    await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                        Connect: false
                    });
                    updateChannel(voiceChannel.id, { locked: true });
                    return interaction.reply({ content: 'The room is now **locked**. Only the room owner can use `/vc` commands, and no new users can join without being explicitly added.', ephemeral: true });
                } else {
                    // Unlock: reset @everyone Connect
                    await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                        Connect: null
                    });
                    updateChannel(voiceChannel.id, { locked: false });
                    return interaction.reply({ content: 'The room is now **unlocked**. Anyone can join normally, and any user in the room can use `/vc` commands.', ephemeral: true });
                }
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'Failed to change the lock state.', ephemeral: true });
            }
        }
    }
};
