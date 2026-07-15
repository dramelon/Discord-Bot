const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    UserSelectMenuBuilder,
    LabelBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const { getChannel, updateChannel, tempChannels } = require('../../utils/tempVCManager');

// Helper to check if user has permission to manage the channel
function hasControlPermission(member, voiceChannel, vcData) {
    if (vcData.ownerId === member.id) return true;
    const perms = vcData.userPermissions?.[member.id] || [];
    if (perms.includes('config')) return true;
    if (!vcData.locked && member.voice.channelId === voiceChannel.id) return true;
    return false;
}

async function syncChannelPermissions(voiceChannel, vcData) {
    try {
        // Reset everyone's connect override based on locked state
        if (vcData.locked) {
            await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                Connect: false
            });
        } else {
            await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                Connect: null
            });
        }

        // Apply overrides for custom users
        const allUserIds = new Set();
        if (vcData.allowedUsers) {
            vcData.allowedUsers.forEach(id => allUserIds.add(id));
        }
        if (vcData.userPermissions) {
            Object.keys(vcData.userPermissions).forEach(id => allUserIds.add(id));
        }

        for (const userId of allUserIds) {
            if (userId === vcData.ownerId) {
                // Owner gets full permissions
                await voiceChannel.permissionOverwrites.create(userId, {
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
            } else {
                const perms = vcData.userPermissions?.[userId] || ['join'];
                const canJoin = perms.includes('join');
                
                if (canJoin) {
                    await voiceChannel.permissionOverwrites.edit(userId, {
                        Connect: true,
                        ViewChannel: true
                    });
                } else {
                    await voiceChannel.permissionOverwrites.edit(userId, {
                        Connect: false,
                        ViewChannel: false
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error synchronizing channel permissions:', error);
    }
}

async function renderControlPanel(voiceChannel, vcData, view = 'main', extra = null) {
    if (view === 'main') {
        const textDisplayContent = `# 🔊 Voice Channel Control Panel\nManage your room settings, members, and custom permissions using the buttons below.\n\n**Room Name:** \`${voiceChannel.name}\`\n**Room Owner:** <@${vcData.ownerId}>\n**Lock Status:** ${vcData.locked ? '🔒 Locked (Only owner/config users can join)' : '🔓 Unlocked (Everyone can join)'}\n**Created:** <t:${Math.floor(vcData.createdAt / 1000)}:R>\n**Added Users:** ${vcData.allowedUsers && vcData.allowedUsers.length > 0 ? vcData.allowedUsers.map(id => `<@${id}>`).join(', ') : 'None'}`;

        const componentsList = [
            {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: textDisplayContent
                    }
                ],
                accessory: {
                    type: 11, // Thumbnail
                    media: {
                        url: "https://cdn-icons-png.flaticon.com/512/3293/3293810.png"
                    },
                    description: "Voice Room"
                }
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_lock_${voiceChannel.id}`)
                        .setLabel(vcData.locked ? '🔓 Unlock Room' : '🔒 Lock Room')
                        .setStyle(vcData.locked ? ButtonStyle.Success : ButtonStyle.Danger)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_rename_${voiceChannel.id}`)
                        .setLabel('✏️ Rename')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_trigger_add_${voiceChannel.id}`)
                        .setLabel('➕ Add User')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_trigger_remove_${voiceChannel.id}`)
                        .setLabel('➖ Remove Access')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_trigger_invite_${voiceChannel.id}`)
                        .setLabel('✉️ Invite User')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_trigger_kick_${voiceChannel.id}`)
                        .setLabel('❌ Kick User')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_page_perm_${voiceChannel.id}_0`)
                        .setLabel('🛡️ Permissions')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_page_config_${voiceChannel.id}`)
                        .setLabel('⚙️ Configuration')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON()
                ]
            }
        ];

        return {
            embeds: [],
            components: [
                {
                    type: 17, // Container
                    components: componentsList
                }
            ],
            flags: 32768
        };
    } 
    else if (view === 'config') {
        const isPublic = voiceChannel.permissionsFor(voiceChannel.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
        const textDisplayContent = `# ⚙️ Channel Configuration\nModify technical voice channel settings below.\n\n**Room Name:** \`${voiceChannel.name}\`\n**User Limit:** ${voiceChannel.userLimit ? `${voiceChannel.userLimit} users` : 'No Limit'}\n**Bitrate:** ${voiceChannel.bitrate / 1000} kbps\n**NSFW:** ${voiceChannel.nsfw ? 'Yes 🔞' : 'No'}\n**Visibility:** ${isPublic ? 'Public 👁️' : 'Private 🔒'}\n**Room Owner:** <@${vcData.ownerId}>`;

        const componentsList = [
            {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: textDisplayContent
                    }
                ],
                accessory: {
                    type: 11, // Thumbnail
                    media: {
                        url: "https://cdn-icons-png.flaticon.com/512/813/813418.png"
                    },
                    description: "Room Config"
                }
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_limit_${voiceChannel.id}`)
                        .setLabel('Set Limit')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_nsfw_${voiceChannel.id}`)
                        .setLabel('Toggle NSFW')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_visibility_${voiceChannel.id}`)
                        .setLabel(isPublic ? 'Make Private' : 'Make Public')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_bitrate_${voiceChannel.id}`)
                        .setLabel(`Set Bitrate (${voiceChannel.bitrate / 1000}k)`)
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_trigger_transfer_${voiceChannel.id}`)
                        .setLabel('👑 Transfer Owner')
                        .setStyle(ButtonStyle.Danger)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_page_main_${voiceChannel.id}`)
                        .setLabel('🏠 Back to Main')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON()
                ]
            }
        ];

        return {
            embeds: [],
            components: [
                {
                    type: 17, // Container
                    components: componentsList
                }
            ],
            flags: 32768
        };
    }
    else if (view === 'permissions') {
        const page = parseInt(extra || '0');
        
        // Build user permission list
        const userSet = new Set();
        userSet.add(vcData.ownerId);
        if (vcData.allowedUsers) {
            vcData.allowedUsers.forEach(id => userSet.add(id));
        }
        if (vcData.userPermissions) {
            Object.keys(vcData.userPermissions).forEach(id => userSet.add(id));
        }
        voiceChannel.members.forEach(member => {
            userSet.add(member.id);
        });

        const userList = [];
        for (const userId of userSet) {
            const member = voiceChannel.guild.members.cache.get(userId) || await voiceChannel.guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            
            let perms = [];
            if (userId === vcData.ownerId) {
                perms = ['owner'];
            } else {
                perms = vcData.userPermissions?.[userId] || ['join'];
            }
            
            userList.push({
                id: userId,
                displayName: member.displayName || member.user.username,
                perms: perms
            });
        }

        const getWeight = (perms) => {
            if (perms.includes('owner')) return 100;
            let score = 0;
            if (perms.includes('config')) score += 50;
            if (perms.includes('add_remove')) score += 30;
            if (perms.includes('join')) score += 10;
            return score;
        };

        userList.sort((a, b) => {
            const wA = getWeight(a.perms);
            const wB = getWeight(b.perms);
            if (wA !== wB) return wB - wA;
            return a.displayName.localeCompare(b.displayName);
        });

        const itemsPerPage = 10;
        const totalPages = Math.max(1, Math.ceil(userList.length / itemsPerPage));
        const currentPage = Math.min(page, totalPages - 1);
        const startIndex = currentPage * itemsPerPage;
        const pageUsers = userList.slice(startIndex, startIndex + itemsPerPage);

        let desc = '';
        pageUsers.forEach((user, idx) => {
            const globalIdx = startIndex + idx + 1;
            const permString = user.perms.map(p => {
                if (p === 'owner') return 'owner';
                if (p === 'config') return 'config';
                if (p === 'add_remove') return 'add/remove member';
                if (p === 'join') return 'join';
                return 'none';
            }).join(', ') || 'none';
            
            desc += `**${globalIdx}:** ${user.displayName} (<@${user.id}>) — \`${permString}\`\n`;
        });

        const textDisplayContent = `# 🛡️ Room Permissions\nSelect a member to adjust their permissions inside this room.\n\n${desc || 'No users found.'}`;

        const componentsList = [
            {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: textDisplayContent
                    }
                ],
                accessory: {
                    type: 11, // Thumbnail
                    media: {
                        url: "https://cdn-icons-png.flaticon.com/512/1271/1271380.png"
                    },
                    description: "Room Permissions"
                }
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_editdefault_${voiceChannel.id}`)
                        .setLabel('⚙️ Edit Default Permissions')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON()
                ]
            }
        ];

        const row2 = { type: 1, components: [] };
        const row3 = { type: 1, components: [] };
        
        pageUsers.forEach((user, idx) => {
            const globalIdx = startIndex + idx + 1;
            const btn = new ButtonBuilder()
                .setCustomId(`vc_btn_userperm_${voiceChannel.id}_${user.id}`)
                .setLabel(`${globalIdx}. ${user.displayName.substring(0, 20)}`)
                .setStyle(ButtonStyle.Secondary)
                .toJSON();
                
            if (idx < 5) {
                row2.components.push(btn);
            } else {
                row3.components.push(btn);
            }
        });

        if (row2.components.length > 0) componentsList.push(row2);
        if (row3.components.length > 0) componentsList.push(row3);

        const row4 = {
            type: 1,
            components: [
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_perm_${voiceChannel.id}_0`)
                    .setLabel('<<')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_perm_${voiceChannel.id}_${Math.max(0, currentPage - 1)}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_goto_perm_${voiceChannel.id}`)
                    .setLabel('🧭 Go To')
                    .setStyle(ButtonStyle.Secondary)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_perm_${voiceChannel.id}_${Math.min(totalPages - 1, currentPage + 1)}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages - 1)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_perm_${voiceChannel.id}_${totalPages - 1}`)
                    .setLabel('>>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages - 1)
                    .toJSON()
            ]
        };
        componentsList.push(row4);

        const row5 = {
            type: 1,
            components: [
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_main_${voiceChannel.id}`)
                    .setLabel('🏠 Back to Main')
                    .setStyle(ButtonStyle.Secondary)
                    .toJSON()
            ]
        };
        componentsList.push(row5);

        return {
            embeds: [],
            components: [
                {
                    type: 17, // Container
                    components: componentsList
                }
            ],
            flags: 32768
        };
    }
    else if (view === 'edit_user_perm') {
        const userId = extra;
        const isDefault = userId === 'default';
        
        let targetName = 'Everyone';
        let perms = vcData.defaultPermissions || ['join'];
        
        if (!isDefault) {
            const member = voiceChannel.guild.members.cache.get(userId) || await voiceChannel.guild.members.fetch(userId).catch(() => null);
            targetName = member ? (member.displayName || member.user.username) : `User (${userId})`;
            perms = vcData.userPermissions?.[userId] || ['join'];
        }

        const textDisplayContent = `# 🛡️ Edit Permissions: ${targetName}\nAdjust room permission overrides. Use the buttons below to toggle each permission level.`;

        const hasConfig = perms.includes('config');
        const hasAddRemove = perms.includes('add_remove');
        const hasJoin = perms.includes('join');

        const componentsList = [
            {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: textDisplayContent
                    }
                ],
                accessory: {
                    type: 11, // Thumbnail
                    media: {
                        url: "https://cdn-icons-png.flaticon.com/512/1271/1271380.png"
                    },
                    description: "Edit User Perm"
                }
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_toggleperm_${voiceChannel.id}_${userId}_config`)
                        .setLabel('Config Settings')
                        .setStyle(hasConfig ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(isDefault)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_toggleperm_${voiceChannel.id}_${userId}_add_remove`)
                        .setLabel('Manage Members')
                        .setStyle(hasAddRemove ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(isDefault)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_toggleperm_${voiceChannel.id}_${userId}_join`)
                        .setLabel('Join Room')
                        .setStyle(hasJoin ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_save_perm_${voiceChannel.id}_${userId}`)
                        .setLabel('💾 Save & Return')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_reset_perm_${voiceChannel.id}_${userId}`)
                        .setLabel('🗑️ Reset')
                        .setStyle(ButtonStyle.Danger)
                        .toJSON()
                ]
            }
        ];

        return {
            embeds: [],
            components: [
                {
                    type: 17, // Container
                    components: componentsList
                }
            ],
            flags: 32768
        };
    }
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('vc')
        .setDescription('Open the temporary voice channel control panel'),

    async execute(interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You must be in a voice channel to use this command.', ephemeral: true });
        }

        const vcData = getChannel(voiceChannel.id);
        if (!vcData) {
            return interaction.reply({ content: '❌ You must be in a temporary voice channel to use this command.', ephemeral: true });
        }

        if (!hasControlPermission(member, voiceChannel, vcData)) {
            return interaction.reply({ content: '❌ You do not have permission to manage this room.', ephemeral: true });
        }

        const render = await renderControlPanel(voiceChannel, vcData, 'main');
        await interaction.reply({ ...render, ephemeral: true });
    },

    async handleButton(interaction) {
        const parts = interaction.customId.split('_');
        if (parts[0] !== 'vc') return;
        
        const action = parts[2];
        const channelId = parts[3];
        
        const voiceChannel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Room no longer exists.', ephemeral: true });
        }
        
        const vcData = getChannel(channelId);
        if (!vcData) {
            return interaction.reply({ content: '❌ Room data not found.', ephemeral: true });
        }

        // Check permission
        if (!hasControlPermission(interaction.member, voiceChannel, vcData)) {
            return interaction.reply({ content: '❌ You do not have permission to manage this room.', ephemeral: true });
        }

        try {
            if (action === 'manage') {
                const render = await renderControlPanel(voiceChannel, vcData, 'main');
                return interaction.reply({ ...render, ephemeral: true });
            }
            else if (action === 'lock') {
                const nextLocked = !vcData.locked;
                updateChannel(channelId, { locked: nextLocked });
                await syncChannelPermissions(voiceChannel, vcData);
                
                const render = await renderControlPanel(voiceChannel, vcData, 'main');
                await interaction.update(render);
            }
            else if (action === 'rename') {
                const modal = new ModalBuilder()
                    .setCustomId(`vc_modal_rename_${channelId}`)
                    .setTitle('Rename Room');
                
                const nameInput = new TextInputBuilder()
                    .setCustomId('new_name')
                    .setLabel('New Room Name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(voiceChannel.name)
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(nameInput);
                modal.addComponents(row);
                return interaction.showModal(modal);
            }
            else if (action === 'trigger') {
                const modalType = parts[4]; // 'add', 'remove', 'kick', 'invite', 'transfer'
                const modal = new ModalBuilder()
                    .setCustomId(`vc_modal_${modalType}_${channelId}`)
                    .setTitle(
                        modalType === 'add' ? 'Add User' :
                        modalType === 'remove' ? 'Remove Access' :
                        modalType === 'kick' ? 'Kick User' :
                        modalType === 'invite' ? 'Invite User' :
                        'Transfer Ownership'
                    );

                const label = modalType === 'add' ? 'Select user to grant access:' :
                              modalType === 'remove' ? 'Select user to remove access:' :
                              modalType === 'kick' ? 'Select user to kick:' :
                              modalType === 'invite' ? 'Select user to invite:' :
                              'Select the new owner:';

                const userSelect = new LabelBuilder()
                    .setLabel(label)
                    .setUserSelectMenuComponent(
                        new UserSelectMenuBuilder()
                            .setCustomId('target_user')
                            .setMinValues(1)
                            .setMaxValues(1)
                    );

                modal.addLabelComponents(userSelect);
                return interaction.showModal(modal);
            }
            else if (action === 'page') {
                const pageType = parts[4]; // 'main', 'config', 'perm'
                const extraVal = parts[5]; // page index
                
                const render = await renderControlPanel(voiceChannel, vcData, pageType, extraVal);
                await interaction.update(render);
            }
            else if (action === 'goto') {
                const modal = new ModalBuilder()
                    .setCustomId(`vc_modal_goto_${channelId}`)
                    .setTitle('Go To Page');

                const pageInput = new TextInputBuilder()
                    .setCustomId('page_num')
                    .setLabel('Enter page number:')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. 1')
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(pageInput);
                modal.addComponents(row);
                return interaction.showModal(modal);
            }
            else if (action === 'editdefault') {
                const render = await renderControlPanel(voiceChannel, vcData, 'edit_user_perm', 'default');
                await interaction.update(render);
            }
            else if (action === 'userperm') {
                const targetUserId = parts[4];
                const render = await renderControlPanel(voiceChannel, vcData, 'edit_user_perm', targetUserId);
                await interaction.update(render);
            }
            else if (action === 'toggleperm') {
                const targetUserId = parts[4];
                const permFlag = parts[5];
                const isDefault = targetUserId === 'default';

                if (isDefault) {
                    if (!vcData.defaultPermissions) {
                        vcData.defaultPermissions = ['join'];
                    }
                    if (vcData.defaultPermissions.includes(permFlag)) {
                        vcData.defaultPermissions = vcData.defaultPermissions.filter(p => p !== permFlag);
                    } else {
                        vcData.defaultPermissions.push(permFlag);
                    }
                    updateChannel(channelId, { defaultPermissions: vcData.defaultPermissions });
                } else {
                    if (!vcData.userPermissions[targetUserId]) {
                        vcData.userPermissions[targetUserId] = [];
                    }
                    if (vcData.userPermissions[targetUserId].includes(permFlag)) {
                        vcData.userPermissions[targetUserId] = vcData.userPermissions[targetUserId].filter(p => p !== permFlag);
                    } else {
                        vcData.userPermissions[targetUserId].push(permFlag);
                    }
                    updateChannel(channelId, { userPermissions: vcData.userPermissions });
                }

                await syncChannelPermissions(voiceChannel, vcData);

                const render = await renderControlPanel(voiceChannel, vcData, 'edit_user_perm', targetUserId);
                await interaction.update(render);
            }
            else if (action === 'reset') {
                const targetUserId = parts[4];
                const isDefault = targetUserId === 'default';

                if (isDefault) {
                    updateChannel(channelId, { defaultPermissions: ['join'] });
                } else {
                    if (vcData.userPermissions[targetUserId]) {
                        delete vcData.userPermissions[targetUserId];
                    }
                    updateChannel(channelId, { userPermissions: vcData.userPermissions });
                }

                await syncChannelPermissions(voiceChannel, vcData);

                const render = await renderControlPanel(voiceChannel, vcData, 'edit_user_perm', targetUserId);
                await interaction.update(render);
            }
            else if (action === 'save') {
                const targetUserId = parts[4];
                // Return to Permissions page (page 0)
                const render = await renderControlPanel(voiceChannel, vcData, 'permissions', '0');
                await interaction.update(render);
            }
            else if (action === 'config') {
                const configAction = parts[4];
                
                if (configAction === 'nsfw') {
                    await voiceChannel.setNSFW(!voiceChannel.nsfw);
                    const render = await renderControlPanel(voiceChannel, vcData, 'config');
                    await interaction.update(render);
                }
                else if (configAction === 'visibility') {
                    const isPublic = voiceChannel.permissionsFor(voiceChannel.guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
                    if (isPublic) {
                        await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                            ViewChannel: false
                        });
                    } else {
                        await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                            ViewChannel: null
                        });
                    }
                    const render = await renderControlPanel(voiceChannel, vcData, 'config');
                    await interaction.update(render);
                }
                else if (configAction === 'bitrate') {
                    let newBitrate = 64000;
                    if (voiceChannel.bitrate === 64000) newBitrate = 96000;
                    else if (voiceChannel.bitrate === 96000) newBitrate = 128000;
                    else newBitrate = 64000;

                    try {
                        await voiceChannel.setBitrate(newBitrate);
                    } catch (err) {
                        try {
                            await voiceChannel.setBitrate(96000);
                        } catch {
                            await voiceChannel.setBitrate(64000).catch(() => {});
                        }
                    }

                    const render = await renderControlPanel(voiceChannel, vcData, 'config');
                    await interaction.update(render);
                }
                else if (configAction === 'limit') {
                    const modal = new ModalBuilder()
                        .setCustomId(`vc_modal_limit_${channelId}`)
                        .setTitle('Set User Limit');
                    
                    const limitInput = new TextInputBuilder()
                        .setCustomId('user_limit')
                        .setLabel('User Limit (0 = No Limit)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(String(voiceChannel.userLimit || 0))
                        .setRequired(true);

                    const row = new ActionRowBuilder().addComponents(limitInput);
                    modal.addComponents(row);
                    return interaction.showModal(modal);
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Failed to perform this action. Check permissions or rate limits.', ephemeral: true }).catch(() => {});
        }
    },

    async handleModal(interaction) {
        const parts = interaction.customId.split('_');
        if (parts[0] !== 'vc') return;
        
        const action = parts[2];
        const channelId = parts[3];
        
        const voiceChannel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Room no longer exists.', ephemeral: true });
        }
        
        const vcData = getChannel(channelId);
        if (!vcData) {
            return interaction.reply({ content: '❌ Room data not found.', ephemeral: true });
        }

        // Check permission
        if (!hasControlPermission(interaction.member, voiceChannel, vcData)) {
            return interaction.reply({ content: '❌ You do not have permission to manage this room.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (action === 'add' || action === 'remove' || action === 'kick' || action === 'invite' || action === 'transfer') {
                const targetUser = interaction.fields.getSelectedUsers('target_user')?.first();
                if (!targetUser) {
                    return interaction.editReply({ content: '❌ No user was selected.' });
                }

                if (action === 'add') {
                    if (!vcData.allowedUsers.includes(targetUser.id)) {
                        vcData.allowedUsers.push(targetUser.id);
                    }
                    if (!vcData.userPermissions) {
                        vcData.userPermissions = {};
                    }
                    if (!vcData.userPermissions[targetUser.id]) {
                        vcData.userPermissions[targetUser.id] = ['join'];
                    }
                    updateChannel(channelId, { 
                        allowedUsers: vcData.allowedUsers,
                        userPermissions: vcData.userPermissions
                    });
                    await syncChannelPermissions(voiceChannel, vcData);
                    await interaction.editReply({ content: `✅ Added ${targetUser} to the room.` });
                }
                else if (action === 'remove') {
                    vcData.allowedUsers = vcData.allowedUsers.filter(id => id !== targetUser.id);
                    if (vcData.userPermissions && vcData.userPermissions[targetUser.id]) {
                        delete vcData.userPermissions[targetUser.id];
                    }
                    updateChannel(channelId, {
                        allowedUsers: vcData.allowedUsers,
                        userPermissions: vcData.userPermissions
                    });
                    await voiceChannel.permissionOverwrites.delete(targetUser.id).catch(() => {});
                    await syncChannelPermissions(voiceChannel, vcData);
                    await interaction.editReply({ content: `✅ Removed ${targetUser}'s access.` });
                }
                else if (action === 'kick') {
                    vcData.allowedUsers = vcData.allowedUsers.filter(id => id !== targetUser.id);
                    if (vcData.userPermissions && vcData.userPermissions[targetUser.id]) {
                        delete vcData.userPermissions[targetUser.id];
                    }
                    updateChannel(channelId, {
                        allowedUsers: vcData.allowedUsers,
                        userPermissions: vcData.userPermissions
                    });
                    
                    await voiceChannel.permissionOverwrites.edit(targetUser.id, {
                        Connect: false,
                        ViewChannel: false
                    }).catch(() => {});

                    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (member && member.voice.channelId === voiceChannel.id) {
                        await member.voice.disconnect().catch(() => {});
                    }
                    
                    await interaction.editReply({ content: `✅ Kicked ${targetUser} and revoked access.` });
                }
                else if (action === 'invite') {
                    if (!vcData.allowedUsers.includes(targetUser.id)) {
                        vcData.allowedUsers.push(targetUser.id);
                    }
                    if (!vcData.userPermissions) {
                        vcData.userPermissions = {};
                    }
                    if (!vcData.userPermissions[targetUser.id]) {
                        vcData.userPermissions[targetUser.id] = ['join'];
                    }
                    updateChannel(channelId, {
                        allowedUsers: vcData.allowedUsers,
                        userPermissions: vcData.userPermissions
                    });
                    await syncChannelPermissions(voiceChannel, vcData);

                    const invite = await voiceChannel.createInvite({
                        maxAge: 3 * 60,
                        maxUses: 1,
                        unique: true
                    });

                    const dmEmbed = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle('Voice Channel Invite')
                        .setDescription(`${interaction.user} has invited you to join their temporary voice channel in **${interaction.guild.name}**!`)
                        .addFields({ name: 'Link', value: invite.url })
                        .setFooter({ text: 'This invite expires in 3 minutes.' });

                    await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                        throw new Error('DMs disabled');
                    });

                    await interaction.editReply({ content: `✅ Invited ${targetUser} via DM.` });
                }
                else if (action === 'transfer') {
                    updateChannel(channelId, { ownerId: targetUser.id });
                    await syncChannelPermissions(voiceChannel, vcData);
                    await interaction.editReply({ content: `👑 Room ownership transferred to ${targetUser}.` });
                }

                const originalMessage = interaction.message;
                if (originalMessage) {
                    const render = await renderControlPanel(voiceChannel, vcData, 'main');
                    await originalMessage.edit(render).catch(() => {});
                }
            }
            else if (action === 'rename') {
                const newName = interaction.fields.getTextInputValue('new_name').trim();
                const cleanName = newName.replace(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g, '').trim();
                
                if (!cleanName) {
                    return interaction.editReply({ content: '❌ Room name cannot be empty.' });
                }

                await voiceChannel.setName(cleanName);
                updateChannel(channelId, { name: cleanName });

                await interaction.editReply({ content: `✅ Room renamed to **${cleanName}**.` });

                const originalMessage = interaction.message;
                if (originalMessage) {
                    const render = await renderControlPanel(voiceChannel, vcData, 'main');
                    await originalMessage.edit(render).catch(() => {});
                }
            }
            else if (action === 'limit') {
                const limitStr = interaction.fields.getTextInputValue('user_limit').trim();
                const limit = parseInt(limitStr);
                if (isNaN(limit) || limit < 0 || limit > 99) {
                    return interaction.editReply({ content: '❌ Limit must be a number between 0 and 99.' });
                }

                await voiceChannel.setUserLimit(limit);
                await interaction.editReply({ content: `✅ User limit updated to ${limit || 'No Limit'}.` });

                const originalMessage = interaction.message;
                if (originalMessage) {
                    const render = await renderControlPanel(voiceChannel, vcData, 'config');
                    await originalMessage.edit(render).catch(() => {});
                }
            }
            else if (action === 'goto') {
                const pageStr = interaction.fields.getTextInputValue('page_num').trim();
                const page = parseInt(pageStr);
                if (isNaN(page) || page < 1) {
                    return interaction.editReply({ content: '❌ Invalid page number.' });
                }

                await interaction.editReply({ content: `✅ Navigating to page ${page}...` });

                const originalMessage = interaction.message;
                if (originalMessage) {
                    const render = await renderControlPanel(voiceChannel, vcData, 'permissions', page - 1);
                    await originalMessage.edit(render).catch(() => {});
                }
            }
        } catch (error) {
            console.error(error);
            if (error.message === 'DMs disabled') {
                await interaction.editReply({ content: '❌ Could not send DM. The user might have DMs disabled.' });
            } else {
                await interaction.editReply({ content: '❌ An error occurred during this operation. Check rate limits (e.g. rename limits).' });
            }
        }
    }
};
