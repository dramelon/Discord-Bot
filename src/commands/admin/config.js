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
function showConfigModal(interaction, modalType, config, guild) {
    if (modalType === 'main') {
        const modal = new ModalBuilder()
            .setCustomId('config_modal_main')
            .setTitle('Main - TempVC Configuration');

        const createLabel = new LabelBuilder()
            .setLabel('Voice Channel to create temporary VC')
            .setDescription('Select the voice channel members join to trigger creation.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCreateChannelId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildVoice])
                    .setDefaultChannels(guild.channels.cache.has(config.tempVCCreateChannelId) ? [config.tempVCCreateChannelId] : [])
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
                    .setDefaultChannels(guild.channels.cache.has(config.tempVCCategoryId) ? [config.tempVCCategoryId] : [])
            );

        const nameLabel = new LabelBuilder()
            .setLabel('Default name of the temporary VC')
            .setDescription('Tip: use {user} for nickname and {user-name} for username.')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('tempVCNameTemplate')
                    .setStyle(TextInputStyle.Short)
                    .setValue(config.tempVCNameTemplate)
                    .setPlaceholder("e.g. {user}'s room")
                    .setRequired(true)
            );

        modal.addLabelComponents(createLabel, categoryLabel, nameLabel);
        return interaction.showModal(modal);
    }

    if (modalType === 'create_channel') {
        const modal = new ModalBuilder()
            .setCustomId('config_modal_create_channel')
            .setTitle('TempVC : Create Channel');

        const createLabel = new LabelBuilder()
            .setLabel('Voice Channel to create temporary VC')
            .setDescription('Select the voice channel members join to trigger creation.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCreateChannelId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildVoice])
                    .setDefaultChannels(guild.channels.cache.has(config.tempVCCreateChannelId) ? [config.tempVCCreateChannelId] : [])
            );

        modal.addLabelComponents(createLabel);
        return interaction.showModal(modal);
    }

    if (modalType === 'category') {
        const modal = new ModalBuilder()
            .setCustomId('config_modal_category')
            .setTitle('TempVC : Category');

        const categoryLabel = new LabelBuilder()
            .setLabel('Category where temporary VCs will be')
            .setDescription('Select the category where temporary voice channels will be created.')
            .setChannelSelectMenuComponent(
                new ChannelSelectMenuBuilder()
                    .setCustomId('tempVCCategoryId')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setChannelTypes([ChannelType.GuildCategory])
                    .setDefaultChannels(guild.channels.cache.has(config.tempVCCategoryId) ? [config.tempVCCategoryId] : [])
            );

        modal.addLabelComponents(categoryLabel);
        return interaction.showModal(modal);
    }

    if (modalType === 'name_template') {
        const modal = new ModalBuilder()
            .setCustomId('config_modal_name_template')
            .setTitle('TempVC : Default Name');

        const nameLabel = new LabelBuilder()
            .setLabel('Default name of the temporary VC')
            .setDescription('Tip: use {user} for nickname and {user-name} for username.')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('tempVCNameTemplate')
                    .setStyle(TextInputStyle.Short)
                    .setValue(config.tempVCNameTemplate)
                    .setPlaceholder("e.g. {user}'s room")
                    .setRequired(true)
            );

        modal.addLabelComponents(nameLabel);
        return interaction.showModal(modal);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('View and update the bot configuration for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option => 
            option.setName('setting')
                .setDescription('Select a setting to edit directly')
                .setRequired(false)
                .addChoices(
                    { name: 'Main - TempVC', value: 'tempvc_main' },
                    { name: 'TempVC : voice channel to create temporary voice channel', value: 'tempvc_create_channel' },
                    { name: 'TempVC : category where temporary voice channels will be', value: 'tempvc_category' },
                    { name: 'TempVC : default name of the temporary voice channel', value: 'tempvc_name_template' }
                )
        ),

    async execute(interaction) {
        // Check Admin Permissions
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const setting = interaction.options.getString('setting');
        const guildId = interaction.guildId;
        const config = getConfig(guildId);

        // 1. Direct Quick Edit via Modal
        if (setting) {
            const modalType = setting.replace('tempvc_', '');
            return showConfigModal(interaction, modalType, config, interaction.guild);
        }

        // 2. Overview Embed with Buttons
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Server Configurations')
            .setDescription('Manage configurations for this server. Use `/config setting:<choice>` to edit directly, or click the buttons below to change settings.')
            .setColor(0x3498DB)
            .addFields(
                { 
                    name: '🔊 Voice Channel to Create Temp VC', 
                    value: `**ID:** \`${config.tempVCCreateChannelId}\`\n**Channel:** <#${config.tempVCCreateChannelId}>\n*The channel members join to trigger creation.*`, 
                    inline: false 
                },
                { 
                    name: '📁 Category for Temporary VCs', 
                    value: `**ID:** \`${config.tempVCCategoryId}\`\n**Category:** <#${config.tempVCCategoryId}>\n*The category where new channels will be created.*`, 
                    inline: false 
                },
                { 
                    name: '📝 Default VC Name Template', 
                    value: `**Template:** \`${config.tempVCNameTemplate}\`\n*Tip: Use \`{user}\` for their nickname and \`{user-name}\` for their username. Example: \`{user}'s room\`.*`, 
                    inline: false 
                }
            )
            .setFooter({ text: `Guild ID: ${guildId}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('config_btn_main')
                .setLabel('Edit All')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚙️'),
            new ButtonBuilder()
                .setCustomId('config_btn_create_channel')
                .setLabel('Edit Create Channel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔊'),
            new ButtonBuilder()
                .setCustomId('config_btn_category')
                .setLabel('Edit Category')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📁'),
            new ButtonBuilder()
                .setCustomId('config_btn_name_template')
                .setLabel('Edit Default Name')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('config_btn_')) return;

        // Check Admin Permissions
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const btnType = interaction.customId.replace('config_btn_', '');
        const config = getConfig(interaction.guildId);

        return showConfigModal(interaction, btnType, config, interaction.guild);
    },

    async handleModal(interaction) {
        if (!interaction.customId.startsWith('config_modal_')) return;

        // Check Admin Permissions
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const modalType = interaction.customId.replace('config_modal_', '');
        const guild = interaction.guild;
        const updates = {};

        // Defer interaction since validation/database update is performed
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
                if (!val) {
                    return interaction.editReply({ content: '❌ The template cannot be empty.' });
                }
                if (val.length > 80) {
                    return interaction.editReply({ content: '❌ Name template is too long. Keep it under 80 characters.' });
                }
                updates.tempVCNameTemplate = val;
            }

            // Save configurations
            updateConfigs(guild.id, updates);

            // Re-fetch configuration to display the updated values
            const updatedConfig = getConfig(guild.id);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Configuration Updated Successfully')
                .setColor(0x2ECC71)
                .setDescription('The settings have been updated for this server:')
                .addFields(
                    { 
                        name: '🔊 Voice Channel to Create Temp VC', 
                        value: `**ID:** \`${updatedConfig.tempVCCreateChannelId}\`\n**Channel:** <#${updatedConfig.tempVCCreateChannelId}>`, 
                        inline: false 
                    },
                    { 
                        name: '📁 Category for Temporary VCs', 
                        value: `**ID:** \`${updatedConfig.tempVCCategoryId}\`\n**Category:** <#${updatedConfig.tempVCCategoryId}>`, 
                        inline: false 
                    },
                    { 
                        name: '📝 Default VC Name Template', 
                        value: `**Template:** \`${updatedConfig.tempVCNameTemplate}\` (e.g. \`Username\'s room\`)`, 
                        inline: false 
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            console.error('Error handling config modal submit:', error);
            await interaction.editReply({ content: '❌ An error occurred while saving the configuration.' });
        }
    }
};
