const { Events, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addChannel, getChannel, updateChannel, removeChannel } = require('../../utils/tempVCManager');

const CREATE_VC_CHANNEL_ID = '1507240107864756244';
const TEMP_VC_CATEGORY_ID = '1447192383178539070';
const DELETE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const member = newState.member;
        
        // --- 1. Handle user joining the "Create VC" channel ---
        if (newState.channelId === CREATE_VC_CHANNEL_ID) {
            try {
                // Create the new channel
                const roomName = `${member.nickname || member.user.username}'s room`;
                const newChannel = await newState.guild.channels.create({
                    name: roomName,
                    type: ChannelType.GuildVoice,
                    parent: TEMP_VC_CATEGORY_ID,
                });

                // Grant the owner full permissions explicitly
                await newChannel.permissionOverwrites.create(member.id, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    ManageChannels: true,
                    ManageRoles: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true,
                    Stream: true,
                    UseVAD: true,
                    PrioritySpeaker: true,
                });

                // Move the member to the new channel
                await member.voice.setChannel(newChannel);

                // Register the channel in our memory manager
                addChannel(newChannel.id, member.id, false);

                // Send the welcome message to the text-in-voice chat
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle(`Welcome to your room, ${member.nickname || member.user.username}!`)
                    .setDescription(`**Basic Information:**\n- You are the room owner. You have full permissions over this channel.\n- The room will be automatically deleted 5 minutes after everyone leaves.\n\n**Commands List:**\n\`/vc name <new_name>\`: Change room name\n\`/vc add <user>\`: Add a user\n\`/vc remove <user>\`: Remove a user\n\`/vc kick <user>\`: Kick a user\n\`/vc invite <user>\`: Invite a user\n\`/vc lock [state]\`: Lock or unlock the room`)
                    .setFooter({ text: 'Use these commands via /vc' });
                
                await newChannel.send({ embeds: [embed] });
                
            } catch (error) {
                console.error("Error creating temporary voice channel:", error);
                // Try to disconnect them or move them back if creation fails
                if (member.voice.channelId === CREATE_VC_CHANNEL_ID) {
                    member.voice.disconnect().catch(console.error);
                }
            }
        }

        // --- 2. Handle user leaving a temporary VC ---
        if (oldState.channelId && oldState.channelId !== newState.channelId) {
            const vcData = getChannel(oldState.channelId);
            if (vcData) {
                // Check if the channel is now empty
                const oldChannel = oldState.guild.channels.cache.get(oldState.channelId);
                if (oldChannel && oldChannel.members.size === 0) {
                    // Start deletion timer
                    if (vcData.timer) clearTimeout(vcData.timer);
                    
                    const timer = setTimeout(async () => {
                        try {
                            const channelToDelete = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);
                            if (channelToDelete) {
                                await channelToDelete.delete();
                            }
                            removeChannel(oldState.channelId);
                        } catch (err) {
                            console.error("Error deleting temp VC after timeout:", err);
                            removeChannel(oldState.channelId);
                        }
                    }, DELETE_TIMEOUT_MS);
                    
                    updateChannel(oldState.channelId, { timer });
                }
            }
        }

        // --- 3. Handle user joining a temporary VC (cancel deletion) ---
        if (newState.channelId && oldState.channelId !== newState.channelId) {
            const vcData = getChannel(newState.channelId);
            if (vcData && vcData.timer) {
                clearTimeout(vcData.timer);
                updateChannel(newState.channelId, { timer: null });
            }
        }
    }
};
