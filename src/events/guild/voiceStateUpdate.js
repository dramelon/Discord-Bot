const { Events, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { tempChannels, addChannel, getChannel, updateChannel, removeChannel } = require('../../utils/tempVCManager');
const { getConfig } = require('../../utils/configManager');

const DELETE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const member = newState.member;
        
        // Load server-specific configurations
        const guildId = newState.guild.id;
        const config = getConfig(guildId);
        if (!config || !config.tempVCCreateChannelId) return;
        
        const createVcChannelId = config.tempVCCreateChannelId;
        const tempVcCategoryId = config.tempVCCategoryId;
        const nameTemplate = config.tempVCNameTemplate;
        
        // --- 1. Handle user joining the "Create VC" channel ---
        if (newState.channelId === createVcChannelId) {
            try {
                // Check if this user already owns an existing temporary VC
                let existingChannel = null;
                for (const [chanId, data] of tempChannels.entries()) {
                    if (data.ownerId === member.id) {
                        const channel = newState.guild.channels.cache.get(chanId);
                        if (channel) {
                            existingChannel = channel;
                            break;
                        }
                    }
                }

                if (existingChannel) {
                    // Cancel deletion timer since they joined
                    const vcData = getChannel(existingChannel.id);
                    if (vcData && vcData.timer) {
                        clearTimeout(vcData.timer);
                        updateChannel(existingChannel.id, { timer: null });
                    }

                    await member.voice.setChannel(existingChannel);
                    return;
                }
                // Resolve name template
                const displayName = member.user.globalName;
                const username = member.user.username;
                const roomName = nameTemplate
                    .replace(/{u}/g, username)
                    .replace(/{d}/g, displayName);

                // Create the new channel
                const newChannel = await newState.guild.channels.create({
                    name: roomName,
                    type: ChannelType.GuildVoice,
                    parent: tempVcCategoryId,
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
                addChannel(newChannel.id, newChannel.guild.id, member.id, newChannel.name, false, []);

                // Send the welcome message to the text-in-voice chat using Components V2
                const welcomePayload = {
                    components: [
                        {
                            type: 17, // Container
                            components: [
                                {
                                    type: 9, // Section
                                    components: [
                                        {
                                            type: 10, // Text Display
                                            content: `## Welcome to your room, ${member.user.globalName}!\n\n**Basic Information:**\n* You are the room owner with full permissions over this channel.\n* The room will be automatically deleted 5 minutes after everyone leaves.\n\n**Manage Room:**\nClick the button below or use the \`/vc\` command to access the interactive control panel to lock/unlock, rename, add/remove/kick/invite members, and configure room permissions.`
                                        }
                                    ],
                                    accessory: {
                                        type: 11, // Thumbnail
                                        media: {
                                            url: "https://cdn-icons-png.flaticon.com/512/3293/3293810.png"
                                        },
                                        description: "Voice room"
                                    }
                                },
                                {
                                    type: 1, // Action Row
                                    components: [
                                        {
                                            type: 2, // Button
                                            style: 1, // Primary (Blurple)
                                            label: "Manage Room",
                                            custom_id: `vc_btn_manage_${newChannel.id}`
                                        }
                                    ]
                                }
                            ]
                        }
                    ],
                    flags: 32768
                };
                
                await newChannel.send(welcomePayload);
                
            } catch (error) {
                console.error("Error creating temporary voice channel:", error);
                // Try to disconnect them or move them back if creation fails
                if (member.voice.channelId === createVcChannelId) {
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
