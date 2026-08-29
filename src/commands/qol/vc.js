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
const { getChannel, updateChannel, removeChannel, tempChannels } = require('../../utils/tempVCManager');
const { getConfig, DEFAULT_TEMP_VC_NAME_TEMPLATE } = require('../../utils/configManager');

// Helper to check if user has permission to manage the channel (owner / config perm / server admin)
function hasControlPermission(member, voiceChannel, vcData) {
    if (!vcData) return false;
    if (vcData.ownerId === member.id) return true;
    const perms = vcData.userPermissions?.[member.id] || [];
    if (perms.includes('config') || perms.includes('owner')) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
    return false;
}

// Helper to check if user can manage members (owner / config / add_remove / server admin)
function canManageMembers(member, voiceChannel, vcData) {
    if (!vcData) return false;
    if (hasControlPermission(member, voiceChannel, vcData)) return true;
    const perms = vcData.userPermissions?.[member.id] || [];
    return perms.includes('add_remove') || perms.includes('manage');
}

async function syncChannelPermissions(voiceChannel, vcData) {
    try {
        const isLocked = vcData.locked !== undefined ? vcData.locked : true;
        const isHidden = vcData.hidden !== undefined ? vcData.hidden : true;

        // Reset everyone's connect & view overrides based on locked & hidden state
        await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
            Connect: isLocked ? false : null,
            ViewChannel: isHidden ? false : null
        }).catch(console.error);

        // Ensure bot has full management permissions
        if (voiceChannel.client.user) {
            await voiceChannel.permissionOverwrites.edit(voiceChannel.client.user.id, {
                ViewChannel: true,
                Connect: true,
                ManageChannels: true,
                ManageRoles: true
            }).catch(() => {});
        }

        // Apply overrides for owner and custom users
        const allUserIds = new Set();
        if (vcData.ownerId) allUserIds.add(vcData.ownerId);
        if (vcData.allowedUsers) {
            vcData.allowedUsers.forEach(id => allUserIds.add(id));
        }
        if (vcData.userPermissions) {
            Object.keys(vcData.userPermissions).forEach(id => allUserIds.add(id));
        }

        for (const userId of allUserIds) {
            if (userId === vcData.ownerId) {
                // Owner gets full permissions explicitly
                await voiceChannel.permissionOverwrites.edit(userId, {
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
                }).catch(() => {});
            } else {
                const perms = vcData.userPermissions?.[userId] || vcData.defaultPermissions || ['join'];
                const canJoin = perms.includes('join');
                
                if (canJoin) {
                    await voiceChannel.permissionOverwrites.edit(userId, {
                        Connect: true,
                        ViewChannel: true
                    }).catch(() => {});
                } else {
                    await voiceChannel.permissionOverwrites.edit(userId, {
                        Connect: false,
                        ViewChannel: isHidden ? false : null
                    }).catch(() => {});
                }
            }
        }
    } catch (error) {
        console.error('Error synchronizing channel permissions:', error);
    }
}

async function renderControlPanel(voiceChannel, vcData, view = 'main', extra = null) {
    const isLocked = vcData.locked !== undefined ? vcData.locked : true;
    const isHidden = vcData.hidden !== undefined ? vcData.hidden : true;

    if (view === 'main') {
        const textDisplayContent = `# 🔊 Voice Channel Control Panel\nManage your room settings, members, and custom permissions using the buttons below.\n\n**Room Name:** \`${voiceChannel.name}\`\n**Room Owner:** <@${vcData.ownerId}>\n**Status:** ${isLocked ? '🔒 Locked (Only owner/allowed users can join)' : '🔓 Unlocked (Everyone can join)'}\n**Visibility:** ${isHidden ? '👻 Hidden (Hidden from everyone)' : '👁️ Visible (Visible to everyone)'}\n**Created:** <t:${Math.floor(vcData.createdAt / 1000)}:R>\n**Added Users:** ${vcData.allowedUsers && vcData.allowedUsers.length > 0 ? vcData.allowedUsers.map(id => `<@${id}>`).join(', ') : 'None'}`;

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
                        .setLabel(isLocked ? '🔓 Unlock Room' : '🔒 Lock Room')
                        .setStyle(isLocked ? ButtonStyle.Success : ButtonStyle.Danger)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_visibility_${voiceChannel.id}`)
                        .setLabel(isHidden ? '👁️ Make Visible' : '👻 Make Hidden')
                        .setStyle(isHidden ? ButtonStyle.Success : ButtonStyle.Secondary)
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
                        .setCustomId(`vc_btn_add_${voiceChannel.id}`)
                        .setLabel('➕ Add User')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_remove_${voiceChannel.id}`)
                        .setLabel('➖ Remove Access')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_invite_${voiceChannel.id}`)
                        .setLabel('✉️ Invite User')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_kick_${voiceChannel.id}`)
                        .setLabel('❌ Kick User')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_page_${voiceChannel.id}_perm_first_0`)
                        .setLabel('🛡️ Permissions')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_page_${voiceChannel.id}_config`)
                        .setLabel('⚙️ Configuration')
                        .setStyle(ButtonStyle.Secondary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row (Hard Reset & Delete)
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_hardreset_${voiceChannel.id}`)
                        .setLabel('🔄 Hard Reset')
                        .setStyle(ButtonStyle.Danger)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_promptdelete_${voiceChannel.id}`)
                        .setLabel('🗑️ Delete Room')
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
    else if (view === 'config') {
        const textDisplayContent = `# ⚙️ Channel Configuration\nModify technical voice channel settings below.\n\n**Room Name:** \`${voiceChannel.name}\`\n**User Limit:** ${voiceChannel.userLimit ? `${voiceChannel.userLimit} users` : 'No Limit'}\n**Bitrate:** ${voiceChannel.bitrate / 1000} kbps\n**NSFW:** ${voiceChannel.nsfw ? 'Yes 🔞' : 'No'}\n**Visibility:** ${isHidden ? 'Hidden 👻' : 'Visible 👁️'}\n**Lock Status:** ${isLocked ? 'Locked 🔒' : 'Unlocked 🔓'}\n**Room Owner:** <@${vcData.ownerId}>`;

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
                        .setCustomId(`vc_btn_config_${voiceChannel.id}_limit`)
                        .setLabel('Set Limit')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_${voiceChannel.id}_nsfw`)
                        .setLabel('Toggle NSFW')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_${voiceChannel.id}_visibility`)
                        .setLabel(isHidden ? 'Make Visible' : 'Make Hidden')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_config_${voiceChannel.id}_bitrate`)
                        .setLabel(`Set Bitrate (${voiceChannel.bitrate / 1000}k)`)
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_transfer_${voiceChannel.id}`)
                        .setLabel('👑 Transfer Owner')
                        .setStyle(ButtonStyle.Danger)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_page_${voiceChannel.id}_main`)
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
            if (perms.includes('add_remove') || perms.includes('manage')) score += 30;
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
                if (p === 'owner') return '👑 owner';
                if (p === 'config') return 'config';
                if (p === 'add_remove' || p === 'manage') return 'manage members';
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
            const isOwner = user.id === vcData.ownerId;
            const btn = new ButtonBuilder()
                .setCustomId(`vc_btn_userperm_${voiceChannel.id}_${user.id}`)
                .setLabel(`${globalIdx}. ${isOwner ? '👑 ' : ''}${user.displayName.substring(0, 18)}`)
                .setStyle(isOwner ? ButtonStyle.Primary : ButtonStyle.Secondary)
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
                    .setCustomId(`vc_btn_page_${voiceChannel.id}_perm_first_0`)
                    .setLabel('<<')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_${voiceChannel.id}_perm_prev_${Math.max(0, currentPage - 1)}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_goto_${voiceChannel.id}`)
                    .setLabel('🧭 Go To')
                    .setStyle(ButtonStyle.Secondary)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_${voiceChannel.id}_perm_next_${Math.min(totalPages - 1, currentPage + 1)}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages - 1)
                    .toJSON(),
                new ButtonBuilder()
                    .setCustomId(`vc_btn_page_${voiceChannel.id}_perm_last_${totalPages - 1}`)
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
                    .setCustomId(`vc_btn_page_${voiceChannel.id}_main`)
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
        const isOwner = userId === vcData.ownerId;
        
        let targetName = 'Everyone';
        let perms = vcData.defaultPermissions || ['join'];
        
        if (isOwner) {
            const member = voiceChannel.guild.members.cache.get(userId) || await voiceChannel.guild.members.fetch(userId).catch(() => null);
            targetName = member ? (member.displayName || member.user.username) : `Owner (${userId})`;
            perms = ['owner', 'config', 'add_remove', 'join'];
        } else if (!isDefault) {
            const member = voiceChannel.guild.members.cache.get(userId) || await voiceChannel.guild.members.fetch(userId).catch(() => null);
            targetName = member ? (member.displayName || member.user.username) : `User (${userId})`;
            perms = vcData.userPermissions?.[userId] || ['join'];
        }

        const textDisplayContent = isOwner
            ? `# 🛡️ Room Owner: ${targetName}\n👑 **The room owner has all permissions permanently enabled and cannot be modified or removed.**`
            : `# 🛡️ Edit Permissions: ${targetName}\nAdjust room permission overrides. Use the buttons below to toggle each permission level.`;

        const hasConfig = isOwner || perms.includes('config');
        const hasAddRemove = isOwner || perms.includes('add_remove') || perms.includes('manage');
        const hasJoin = isOwner || perms.includes('join');

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
                        .setDisabled(isDefault || isOwner)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_toggleperm_${voiceChannel.id}_${userId}_add_remove`)
                        .setLabel('Manage Members')
                        .setStyle(hasAddRemove ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(isDefault || isOwner)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_toggleperm_${voiceChannel.id}_${userId}_join`)
                        .setLabel('Join Room')
                        .setStyle(hasJoin ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(isOwner)
                        .toJSON()
                ]
            },
            {
                type: 1, // Action Row
                components: [
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_saveperm_${voiceChannel.id}_${userId}`)
                        .setLabel(isOwner ? '⬅️ Back to Permissions' : '💾 Save & Return')
                        .setStyle(ButtonStyle.Primary)
                        .toJSON(),
                    new ButtonBuilder()
                        .setCustomId(`vc_btn_resetperm_${voiceChannel.id}_${userId}`)
                        .setLabel('🗑️ Reset')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(isOwner)
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
        if (parts[0] !== 'vc' || parts[1] !== 'btn') return;
        
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

        // Check permission based on action
        const memberActions = ['add', 'remove', 'kick', 'invite'];
        if (memberActions.includes(action)) {
            if (!canManageMembers(interaction.member, voiceChannel, vcData)) {
                return interaction.reply({ content: '❌ You do not have permission to manage members in this room.', ephemeral: true });
            }
        } else if (action === 'manage' || action === 'cancelcountdown' || action === 'cancelprompt') {
            // Safe actions that anyone in room / responding to their prompt can click
        } else {
            if (!hasControlPermission(interaction.member, voiceChannel, vcData)) {
                return interaction.reply({ content: '❌ You do not have permission to manage this room.', ephemeral: true });
            }
        }

        try {
            if (action === 'manage') {
                const render = await renderControlPanel(voiceChannel, vcData, 'main');
                return interaction.reply({ ...render, ephemeral: true });
            }
            else if (action === 'lock') {
                const nextLocked = !(vcData.locked !== undefined ? vcData.locked : true);
                updateChannel(channelId, { locked: nextLocked });
                vcData.locked = nextLocked;
                
                const render = await renderControlPanel(voiceChannel, vcData, 'main');
                await interaction.update(render);

                syncChannelPermissions(voiceChannel, vcData).catch(console.error);
            }
            else if (action === 'visibility') {
                const nextHidden = !(vcData.hidden !== undefined ? vcData.hidden : true);
                updateChannel(channelId, { hidden: nextHidden });
                vcData.hidden = nextHidden;

                const render = await renderControlPanel(voiceChannel, vcData, 'main');
                await interaction.update(render);

                syncChannelPermissions(voiceChannel, vcData).catch(console.error);
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
            else if (action === 'add' || action === 'remove' || action === 'kick' || action === 'invite' || action === 'transfer') {
                const modal = new ModalBuilder()
                    .setCustomId(`vc_modal_${action}_${channelId}`)
                    .setTitle(
                        action === 'add' ? 'Add User' :
                        action === 'remove' ? 'Remove Access' :
                        action === 'kick' ? 'Kick User' :
                        action === 'invite' ? 'Invite User' :
                        'Transfer Ownership'
                    );

                const label = action === 'add' ? 'Select user to grant access:' :
                              action === 'remove' ? 'Select user to remove access:' :
                              action === 'kick' ? 'Select user to kick:' :
                              action === 'invite' ? 'Select user to invite:' :
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
                const pageType = parts[4] || 'main'; // 'main', 'config', 'perm'
                let extraVal = parts[5] || null; // page index or subaction
                if (pageType === 'perm' && parts[6] !== undefined) {
                    extraVal = parts[6];
                }
                
                const render = await renderControlPanel(voiceChannel, vcData, pageType === 'perm' ? 'permissions' : pageType, extraVal);
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
                const permFlag = parts.slice(5).join('_');
                const isDefault = targetUserId === 'default';

                if (targetUserId === vcData.ownerId) {
                    return interaction.reply({ content: '❌ Room owner permissions are permanent and cannot be modified.', ephemeral: true });
                }

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
                    if (!vcData.userPermissions) {
                        vcData.userPermissions = {};
                    }
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

                // Update UI immediately to prevent interaction timeout
                const render = await renderControlPanel(voiceChannel, vcData, 'edit_user_perm', targetUserId);
                await interaction.update(render);

                // Sync permissions asynchronously
                syncChannelPermissions(voiceChannel, vcData).catch(console.error);
            }
            else if (action === 'resetperm') {
                const targetUserId = parts[4];
                const isDefault = targetUserId === 'default';

                if (targetUserId === vcData.ownerId) {
                    return interaction.reply({ content: '❌ Room owner permissions cannot be reset.', ephemeral: true });
                }

                if (isDefault) {
                    vcData.defaultPermissions = ['join'];
                    updateChannel(channelId, { defaultPermissions: ['join'] });
                } else {
                    if (vcData.userPermissions && vcData.userPermissions[targetUserId]) {
                        delete vcData.userPermissions[targetUserId];
                    }
                    updateChannel(channelId, { userPermissions: vcData.userPermissions || {} });
                }

                const render = await renderControlPanel(voiceChannel, vcData, 'edit_user_perm', targetUserId);
                await interaction.update(render);

                syncChannelPermissions(voiceChannel, vcData).catch(console.error);
            }
            else if (action === 'saveperm') {
                // Return to Permissions page (page 0)
                const render = await renderControlPanel(voiceChannel, vcData, 'permissions', '0');
                await interaction.update(render);
                syncChannelPermissions(voiceChannel, vcData).catch(console.error);
            }
            else if (action === 'config') {
                const configAction = parts[4];
                
                if (configAction === 'nsfw') {
                    await voiceChannel.setNSFW(!voiceChannel.nsfw);
                    const render = await renderControlPanel(voiceChannel, vcData, 'config');
                    await interaction.update(render);
                }
                else if (configAction === 'visibility') {
                    const nextHidden = !(vcData.hidden !== undefined ? vcData.hidden : true);
                    updateChannel(channelId, { hidden: nextHidden });
                    vcData.hidden = nextHidden;
                    await syncChannelPermissions(voiceChannel, vcData);

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
            else if (action === 'hardreset') {
                if (interaction.member.id !== vcData.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Only the room owner or a server administrator can hard-reset this room.', ephemeral: true });
                }

                const config = getConfig(interaction.guild.id);
                const nameTemplate = config?.tempVCNameTemplate || DEFAULT_TEMP_VC_NAME_TEMPLATE;
                const ownerMember = voiceChannel.guild.members.cache.get(vcData.ownerId) || await voiceChannel.guild.members.fetch(vcData.ownerId).catch(() => null);
                const displayName = ownerMember?.user?.globalName || ownerMember?.user?.username || 'User';
                const username = ownerMember?.user?.username || 'User';
                const defaultName = nameTemplate.replace(/{u}/g, username).replace(/{d}/g, displayName);

                await voiceChannel.setName(defaultName).catch(() => {});
                await voiceChannel.setUserLimit(0).catch(() => {});
                await voiceChannel.setBitrate(64000).catch(() => {});
                await voiceChannel.setNSFW(false).catch(() => {});

                updateChannel(channelId, {
                    name: defaultName,
                    locked: true,
                    hidden: true,
                    allowedUsers: [],
                    userPermissions: {},
                    defaultPermissions: ['join']
                });
                vcData.name = defaultName;
                vcData.locked = true;
                vcData.hidden = true;
                vcData.allowedUsers = [];
                vcData.userPermissions = {};
                vcData.defaultPermissions = ['join'];

                const baseOverwrites = [
                    {
                        id: voiceChannel.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
                    },
                    {
                        id: vcData.ownerId,
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
                if (voiceChannel.client.user) {
                    baseOverwrites.push({
                        id: voiceChannel.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageRoles
                        ]
                    });
                }
                await voiceChannel.permissionOverwrites.set(baseOverwrites).catch(() => {});

                const render = await renderControlPanel(voiceChannel, vcData, 'main');
                await interaction.update(render);
            }
            else if (action === 'promptdelete') {
                if (interaction.member.id !== vcData.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Only the room owner or a server administrator can delete this room.', ephemeral: true });
                }

                return interaction.reply({
                    content: '⚠️ **Are you sure you want to delete this temporary voice channel?**\nOnce confirmed, the channel will be deleted after a 5-second countdown unless cancelled.',
                    components: [
                        {
                            type: 1,
                            components: [
                                new ButtonBuilder()
                                    .setCustomId(`vc_btn_confirmdelete_${channelId}`)
                                    .setLabel('🚨 Confirm Delete')
                                    .setStyle(ButtonStyle.Danger)
                                    .toJSON(),
                                new ButtonBuilder()
                                    .setCustomId(`vc_btn_cancelprompt_${channelId}`)
                                    .setLabel('Cancel')
                                    .setStyle(ButtonStyle.Secondary)
                                    .toJSON()
                            ]
                        }
                    ],
                    ephemeral: true
                });
            }
            else if (action === 'cancelprompt') {
                return interaction.update({ content: '✅ Channel deletion cancelled.', components: [] });
            }
            else if (action === 'confirmdelete') {
                if (interaction.member.id !== vcData.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Only the room owner or a server administrator can delete this room.', ephemeral: true });
                }

                if (vcData.activeDeleteTimer) {
                    return interaction.update({ content: '⏳ Deletion countdown is already in progress.', components: [] });
                }

                await interaction.update({ content: '⏳ Deletion initiated. Deleting in 5 seconds...', components: [] });

                const countdownMessage = await voiceChannel.send({
                    content: '⚠️ **This temporary voice channel will be deleted in 5 seconds...**',
                    components: [
                        {
                            type: 1,
                            components: [
                                new ButtonBuilder()
                                    .setCustomId(`vc_btn_cancelcountdown_${channelId}`)
                                    .setLabel('❌ Cancel Deletion')
                                    .setStyle(ButtonStyle.Danger)
                                    .toJSON()
                            ]
                        }
                    ]
                }).catch(() => null);

                const timer = setTimeout(async () => {
                    try {
                        const ch = await voiceChannel.guild.channels.fetch(channelId).catch(() => null);
                        if (ch) {
                            await ch.delete('Owner confirmed VC deletion');
                        }
                        removeChannel(channelId);
                    } catch (err) {
                        console.error('Error during confirmed VC deletion:', err);
                        removeChannel(channelId);
                    }
                }, 5000);

                vcData.activeDeleteTimer = timer;
                vcData.countdownMessageId = countdownMessage?.id;
            }
            else if (action === 'cancelcountdown') {
                if (vcData.activeDeleteTimer) {
                    clearTimeout(vcData.activeDeleteTimer);
                    vcData.activeDeleteTimer = null;
                }

                await interaction.update({
                    content: `✅ **Channel deletion cancelled by ${interaction.user}.**`,
                    components: []
                });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Failed to perform this action. Check permissions or rate limits.', ephemeral: true }).catch(() => {});
        }
    },

    async handleModal(interaction) {
        const parts = interaction.customId.split('_');
        if (parts[0] !== 'vc' || parts[1] !== 'modal') return;
        
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

        // Check permission based on action
        const memberActions = ['add', 'remove', 'kick', 'invite'];
        if (memberActions.includes(action)) {
            if (!canManageMembers(interaction.member, voiceChannel, vcData)) {
                return interaction.reply({ content: '❌ You do not have permission to manage members in this room.', ephemeral: true });
            }
        } else {
            if (!hasControlPermission(interaction.member, voiceChannel, vcData)) {
                return interaction.reply({ content: '❌ You do not have permission to manage this room.', ephemeral: true });
            }
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (action === 'add' || action === 'remove' || action === 'kick' || action === 'invite' || action === 'transfer') {
                const targetUser = interaction.fields.getSelectedUsers('target_user')?.first();
                if (!targetUser) {
                    return interaction.editReply({ content: '❌ No user was selected.' });
                }

                if (action === 'add') {
                    if (!vcData.allowedUsers) vcData.allowedUsers = [];
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
                    if (targetUser.id === vcData.ownerId) {
                        return interaction.editReply({ content: '❌ The room owner cannot be removed from the room.' });
                    }

                    if (vcData.allowedUsers) {
                        vcData.allowedUsers = vcData.allowedUsers.filter(id => id !== targetUser.id);
                    }
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
                    if (targetUser.id === vcData.ownerId) {
                        return interaction.editReply({ content: '❌ The room owner cannot be kicked from the room.' });
                    }

                    if (vcData.allowedUsers) {
                        vcData.allowedUsers = vcData.allowedUsers.filter(id => id !== targetUser.id);
                    }
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
                    if (!vcData.allowedUsers) vcData.allowedUsers = [];
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
                    if (targetUser.id === vcData.ownerId) {
                        return interaction.editReply({ content: '❌ That user is already the room owner.' });
                    }

                    vcData.ownerId = targetUser.id;
                    updateChannel(channelId, { ownerId: targetUser.id });
                    await syncChannelPermissions(voiceChannel, vcData);
                    await interaction.editReply({ content: `👑 Room ownership transferred to ${targetUser}.` });
                }

                const originalMessage = interaction.message;
                if (originalMessage && originalMessage.editable) {
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
                vcData.name = cleanName;
                updateChannel(channelId, { name: cleanName });

                await interaction.editReply({ content: `✅ Room renamed to **${cleanName}**.` });

                const originalMessage = interaction.message;
                if (originalMessage && originalMessage.editable) {
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
                if (originalMessage && originalMessage.editable) {
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
                if (originalMessage && originalMessage.editable) {
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
    },

    renderControlPanel,
    syncChannelPermissions,
    hasControlPermission,
    canManageMembers
};
