const { Events, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { tempChannels, addChannel, getChannel, updateChannel, removeChannel } = require('../../utils/tempVCManager');
const { renderControlPanel } = require('../../commands/qol/vc');
const { getConfig } = require('../../utils/configManager');

const DELETE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const member = newState.member;
        if (!member) return;
        
        // Load server-specific configurations
        const guildId = newState.guild.id;
        const config = getConfig(guildId);
        if (!config || !config.tempVCCreateChannelId) return;
        
        const createVcChannelId = config.tempVCCreateChannelId;
        const tempVcCategoryId = config.tempVCCategoryId;
        const nameTemplate = config.tempVCNameTemplate || "{d}'s Room";
        
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
                const displayName = member.user.globalName || member.user.username;
                const username = member.user.username;
                const roomName = nameTemplate
                    .replace(/{u}/g, username)
                    .replace(/{d}/g, displayName);

                // Configure locked & hidden permissions by default
                const permissionOverwrites = [
                    {
                        id: newState.guild.roles.everyone.id,
                        deny: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ]
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageRoles,
                            PermissionFlagsBits.MuteMembers,
                            PermissionFlagsBits.DeafenMembers,
                            PermissionFlagsBits.MoveMembers,
                            PermissionFlagsBits.Stream,
                            PermissionFlagsBits.UseVAD,
                            PermissionFlagsBits.PrioritySpeaker
                        ]
                    }
                ];

                if (newState.client.user) {
                    permissionOverwrites.push({
                        id: newState.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageRoles
                        ]
                    });
                }

                // Create the new channel
                const newChannel = await newState.guild.channels.create({
                    name: roomName,
                    type: ChannelType.GuildVoice,
                    parent: tempVcCategoryId,
                    permissionOverwrites: permissionOverwrites
                });

                // Move the member to the new channel
                await member.voice.setChannel(newChannel);

                // Register the channel in our memory manager (locked: true, hidden: true)
                addChannel(newChannel.id, newChannel.guild.id, member.id, newChannel.name, true, [], {}, true, ['join']);

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
                                            content: `## Welcome to your room, ${displayName}!\n\n**Basic Information:**\n* You are the room owner with full permissions over this channel.\n* The room is **locked** and **hidden** from everyone by default.\n* The room will be automatically deleted 5 minutes after everyone leaves.\n\n**Manage Room:**\nUse the control panel below or the \`/vc\` command at any time to lock/unlock, toggle visibility, rename, add/remove/kick/invite members, and configure room permissions.`
                                        }
                                    ],
                                    accessory: {
                                        type: 11, // Thumbnail
                                        media: {
                                            url: "https://cdn-icons-png.flaticon.com/512/3293/3293810.png"
                                        },
                                        description: "Voice room"
                                    }
                                }
                            ]
                        }
                    ],
                    flags: 32768
                };
                
                await newChannel.send(welcomePayload);

                // Send the Voice Channel Control Panel into the room by default
                const vcData = getChannel(newChannel.id);
                if (vcData) {
                    const controlPanelPayload = await renderControlPanel(newChannel, vcData, 'main');
                    await newChannel.send(controlPanelPayload);
                }
                
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
