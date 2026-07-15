const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionFlagsBits, 
    ChannelType,
    LabelBuilder,
    ChannelSelectMenuBuilder
} = require('discord.js');
const { getConfig, updateConfigs } = require('../../utils/configManager');
const { isAdmin } = require('../../utils/adminCheck');

// Helper to show the dynamic configurations modal
function showSetupModal(interaction, modalType, config, guild) {
    if (modalType === 'main') {
        const modal = new ModalBuilder()
            .setCustomId('setup_modal_main')
            .setTitle('Quick Setup - TempVC Settings');

        const createLabel = new LabelBuilder()
            .setLabel('Voice Channel to create temporary VC')
            .setDescription('Select the voice channel members join to trigger creation.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCreateChannelId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildVoice])
                    .setDefaultChannels(config?.tempVCCreateChannelId && guild.channels.cache.has(config.tempVCCreateChannelId) ? [config.tempVCCreateChannelId] : [])
            );

        const categoryLabel = new LabelBuilder()
            .setLabel('Category where temporary VCs will be')
            .setDescription('Select the category where new voice channels will be created.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCategoryId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildCategory])
                    .setDefaultChannels(config?.tempVCCategoryId && guild.channels.cache.has(config.tempVCCategoryId) ? [config.tempVCCategoryId] : [])
            );

        const nameLabel = new LabelBuilder()
            .setLabel('Default name of the temporary VC')
            .setDescription('Tip: use {u} for username and {d} for displayname.')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('tempVCNameTemplate')
                    .setStyle(TextInputStyle.Short)
                    .setValue(config?.tempVCNameTemplate || "{d}'s Room")
                    .setPlaceholder("e.g. {d}'s Room")
                    .setRequired(false)
            );

        modal.addLabelComponents(createLabel, categoryLabel, nameLabel);
        return interaction.showModal(modal);
    }

    if (modalType === 'create_channel') {
        const modal = new ModalBuilder()
            .setCustomId('setup_modal_create_channel')
            .setTitle('Setup: Create Channel');

        const createLabel = new LabelBuilder()
            .setLabel('Voice Channel to create temporary VC')
            .setDescription('Select the voice channel members join to trigger creation.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCreateChannelId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildVoice])
                    .setDefaultChannels(config?.tempVCCreateChannelId && guild.channels.cache.has(config.tempVCCreateChannelId) ? [config.tempVCCreateChannelId] : [])
            );

        modal.addLabelComponents(createLabel);
        return interaction.showModal(modal);
    }

    if (modalType === 'category') {
        const modal = new ModalBuilder()
            .setCustomId('setup_modal_category')
            .setTitle('Setup: VC Category');

        const categoryLabel = new LabelBuilder()
            .setLabel('Category where temporary VCs will be')
            .setDescription('Select the category where temporary voice channels will be created.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCategoryId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildCategory])
                    .setDefaultChannels(config?.tempVCCategoryId && guild.channels.cache.has(config.tempVCCategoryId) ? [config.tempVCCategoryId] : [])
            );

        modal.addLabelComponents(categoryLabel);
        return interaction.showModal(modal);
    }

    if (modalType === 'name_template') {
        const modal = new ModalBuilder()
            .setCustomId('setup_modal_name_template')
            .setTitle('Setup: Default VC Name');

        const nameLabel = new LabelBuilder()
            .setLabel('Default name of the temporary VC')
            .setDescription('Tip: use {u} for username and {d} for displayname.')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('tempVCNameTemplate')
                    .setStyle(TextInputStyle.Short)
                    .setValue(config?.tempVCNameTemplate || "{d}'s Room")
                    .setPlaceholder("e.g. {d}'s Room")
                    .setRequired(false)
            );

        modal.addLabelComponents(nameLabel);
        return interaction.showModal(modal);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure per-server settings for temporary voice channels.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('setting')
                .setDescription('Select a specific setting to configure immediately via modal')
                .setRequired(false)
                .addChoices(
                    { name: 'All Settings (Quick Setup)', value: 'main' },
                    { name: 'Set Create VC Channel', value: 'create_channel' },
                    { name: 'Set Category', value: 'category' },
                    { name: 'Set Default VC Name', value: 'name_template' }
                )
        ),

    async execute(interaction) {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const setting = interaction.options.getString('setting');
        const guildId = interaction.guildId;
        const config = getConfig(guildId);

        // 1. Direct modal popup if option was specified
        if (setting) {
            return showSetupModal(interaction, setting, config, interaction.guild);
        }

        // 2. Otherwise display setup overview embed with button triggers
        const isConfigured = !!(config && config.tempVCCreateChannelId && config.tempVCCategoryId);
        
        const embed = new EmbedBuilder()
            .setTitle('🛠️ Bot Server Setup')
            .setDescription('Configure the bot settings for this server. Setting up the temporary voice channels requires configuring a voice generator channel, a category, and a name template.')
            .setColor(isConfigured ? 0x2ECC71 : 0xE74C3C)
            .addFields(
                {
                    name: '📋 Setup Status',
                    value: isConfigured ? '✅ **Fully Configured**' : '❌ **Not Configured / Incomplete**',
                    inline: false
                },
                {
                    name: '🔊 Voice Channel to Create Temp VC',
                    value: config?.tempVCCreateChannelId ? `<#${config.tempVCCreateChannelId}> (\`${config.tempVCCreateChannelId}\`)` : '`Not Set`',
                    inline: true
                },
                {
                    name: '📁 Category for Temporary VCs',
                    value: config?.tempVCCategoryId ? `<#${config.tempVCCategoryId}> (\`${config.tempVCCategoryId}\`)` : '`Not Set`',
                    inline: true
                },
                {
                    name: '📝 Default VC Name Template',
                    value: `\`${config?.tempVCNameTemplate || "{d}'s Room"}\``,
                    inline: false
                }
            )
            .setFooter({ text: `Guild ID: ${guildId}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_btn_main')
                .setLabel(isConfigured ? 'Edit All' : 'Quick Setup')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚙️'),
            new ButtonBuilder()
                .setCustomId('setup_btn_create_channel')
                .setLabel('Set Create Channel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔊'),
            new ButtonBuilder()
                .setCustomId('setup_btn_category')
                .setLabel('Set Category')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📁'),
            new ButtonBuilder()
                .setCustomId('setup_btn_name_template')
                .setLabel('Set Default Name')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('setup_btn_')) return;

        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const btnType = interaction.customId.replace('setup_btn_', '');
        const config = getConfig(interaction.guildId);

        return showSetupModal(interaction, btnType, config, interaction.guild);
    },

    async handleModal(interaction) {
        if (!interaction.customId.startsWith('setup_modal_')) return;

        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const modalType = interaction.customId.replace('setup_modal_', '');
        const guild = interaction.guild;
        const updates = {};

        await interaction.deferReply({ ephemeral: true });

        try {
            if (modalType === 'main' || modalType === 'create_channel') {
                const channels = interaction.fields.getSelectedChannels('tempVCCreateChannelId');
                const id = channels ? Array.from(channels.keys())[0] : null;
                if (!id) {
                    return interaction.editReply({ content: '❌ Please select a voice channel.' });
                }
                updates.tempVCCreateChannelId = id;
            }

            if (modalType === 'main' || modalType === 'category') {
                const channels = interaction.fields.getSelectedChannels('tempVCCategoryId');
                const id = channels ? Array.from(channels.keys())[0] : null;
                if (!id) {
                    return interaction.editReply({ content: '❌ Please select a category.' });
                }
                updates.tempVCCategoryId = id;
            }

            if (modalType === 'main' || modalType === 'name_template') {
                const val = interaction.fields.getTextInputValue('tempVCNameTemplate').trim();
                if (val.length > 80) {
                    return interaction.editReply({ content: '❌ Name template is too long. Keep it under 80 characters.' });
                }
                updates.tempVCNameTemplate = val || "{d}'s Room";
            }

            const oldConfig = getConfig(guild.id) || {};

            // Save configurations
            updateConfigs(guild.id, updates);

            const changes = [];
            const sameValues = [];

            const formatChannel = (id) => id ? `<#${id}> (\`${id}\`)` : '`Not Set`';
            const formatTemplate = (template) => template ? `\`${template}\`` : '`Not Set`';

            if (updates.hasOwnProperty('tempVCCreateChannelId')) {
                const oldVal = oldConfig.tempVCCreateChannelId || null;
                const newVal = updates.tempVCCreateChannelId;
                if (oldVal !== newVal) {
                    changes.push({
                        name: '🔊 Voice Channel to Create Temp VC',
                        value: `**Before:** ${formatChannel(oldVal)}\n**After:** ${formatChannel(newVal)}`,
                        inline: false
                    });
                } else {
                    sameValues.push({
                        name: '🔊 Voice Channel to Create Temp VC',
                        value: `**Value:** ${formatChannel(oldVal)} *(No change)*`,
                        inline: false
                    });
                }
            }

            if (updates.hasOwnProperty('tempVCCategoryId')) {
                const oldVal = oldConfig.tempVCCategoryId || null;
                const newVal = updates.tempVCCategoryId;
                if (oldVal !== newVal) {
                    changes.push({
                        name: '📁 Category for Temporary VCs',
                        value: `**Before:** ${formatChannel(oldVal)}\n**After:** ${formatChannel(newVal)}`,
                        inline: false
                    });
                } else {
                    sameValues.push({
                        name: '📁 Category for Temporary VCs',
                        value: `**Value:** ${formatChannel(oldVal)} *(No change)*`,
                        inline: false
                    });
                }
            }

            if (updates.hasOwnProperty('tempVCNameTemplate')) {
                const oldVal = oldConfig.tempVCNameTemplate || null;
                const newVal = updates.tempVCNameTemplate;
                if (oldVal !== newVal) {
                    changes.push({
                        name: '📝 Default VC Name Template',
                        value: `**Before:** ${formatTemplate(oldVal)}\n**After:** ${formatTemplate(newVal)}`,
                        inline: false
                    });
                } else {
                    sameValues.push({
                        name: '📝 Default VC Name Template',
                        value: `**Value:** ${formatTemplate(oldVal)} *(No change)*`,
                        inline: false
                    });
                }
            }

            const successEmbed = new EmbedBuilder().setTimestamp();

            if (changes.length > 0) {
                successEmbed
                    .setTitle('✅ Setup Configuration Updated')
                    .setColor(0x2ECC71)
                    .setDescription('The settings have been configured successfully:')
                    .addFields(changes);
            } else {
                successEmbed
                    .setTitle('ℹ️ No Changes Made')
                    .setColor(0xF1C40F)
                    .setDescription('The submitted values are identical to the existing settings:')
                    .addFields(sameValues);
            }

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            console.error('Error handling setup modal submit:', error);
            await interaction.editReply({ content: '❌ An error occurred while saving the setup configuration.' });
        }
    }
};
