const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Steal as Sticker')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .setIntegrationTypes([0]) // Guild install only, since it requires guild emoji management
        .setContexts([0]), // Guilds only
        
    async execute(interaction) {
        const message = interaction.targetMessage;
        const stickers = [];
        
        message.stickers.forEach(sticker => {
            stickers.push({
                id: sticker.id,
                name: sticker.name,
                url: sticker.url,
            });
        });
        
        if (stickers.length === 0) {
            return interaction.reply({ content: 'No stickers found in that message.', ephemeral: true });
        }
        
        if (stickers.length === 1) {
            return this.showStickerModal(interaction, stickers[0]);
        } else {
            // Dropdown menu to pick one
            const options = stickers.slice(0, 25).map(s => ({
                label: s.name,
                value: `${s.id}|${s.name}` // encode data in value
            }));
            
            const select = new StringSelectMenuBuilder()
                .setCustomId('Steal as Sticker_select')
                .setPlaceholder('Select a sticker to steal')
                .addOptions(options);
                
            const row = new ActionRowBuilder().addComponents(select);
            
            await interaction.reply({ content: `Multiple stickers found (${stickers.length}). Please select one:`, components: [row], ephemeral: true });
        }
    },
    
    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('Steal as Sticker_select')) return;
        const data = interaction.values[0].split('|');
        const sticker = {
            id: data[0],
            name: data[1],
            url: `https://media.discordapp.net/stickers/${data[0]}.png`
        };
        await this.showStickerModal(interaction, sticker);
    },
    
    async showStickerModal(interaction, sticker) {
        const modal = new ModalBuilder()
            .setCustomId(`Steal as Sticker_modal_${sticker.id}`)
            .setTitle('Name the Stolen Sticker');
            
        const nameInput = new TextInputBuilder()
            .setCustomId('stickerNameInput')
            .setLabel('Sticker Name')
            .setRequired(true)
            .setValue(sticker.name) // prefilled
            .setStyle(TextInputStyle.Short);
            
        const row = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(row);
        
        await interaction.showModal(modal);
    },
    
    async handleModal(interaction) {
        if (!interaction.customId.startsWith('Steal as Sticker_modal_')) return;
        const id = interaction.customId.split('_').pop();
        const newName = interaction.fields.getTextInputValue('stickerNameInput');
        const url = `https://media.discordapp.net/stickers/${id}.png`;
        
        await interaction.deferReply({ ephemeral: true });
        try {
            const newSticker = await interaction.guild.stickers.create({ file: url, name: newName, tags: newName });
            await interaction.editReply(`Successfully stolen sticker: **${newSticker.name}**`);
        } catch (error) {
            console.error(error);
            await interaction.editReply(`Failed to create sticker: ${error.message}`);
        }
    }
};
