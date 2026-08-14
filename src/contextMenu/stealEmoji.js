const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Steal as Emoji')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .setIntegrationTypes([0]) // Guild install only, since it requires guild emoji management
        .setContexts([0]), // Guilds only
        
    async execute(interaction) {
        const message = interaction.targetMessage;
        const customEmojis = [];
        
        // Match <a:name:id> or <:name:id>
        const regex = /<(a)?:(.+?):(\d+)>/g;
        let match;
        while ((match = regex.exec(message.content)) !== null) {
            // Prevent duplicates
            if (!customEmojis.find(e => e.id === match[3])) {
                customEmojis.push({
                    animated: !!match[1],
                    name: match[2],
                    id: match[3]
                });
            }
        }
        
        // Check custom reactions
        message.reactions.cache.forEach(reaction => {
            if (reaction.emoji.id) {
                // Ignore if we already got it
                if (!customEmojis.find(e => e.id === reaction.emoji.id)) {
                    customEmojis.push({
                        animated: reaction.emoji.animated,
                        name: reaction.emoji.name,
                        id: reaction.emoji.id
                    });
                }
            }
        });
        
        if (customEmojis.length === 0) {
            return interaction.reply({ content: 'No custom emojis found in that message.', ephemeral: true });
        }
        
        if (customEmojis.length === 1) {
            return this.showEmojiModal(interaction, customEmojis[0]);
        } else {
            // Dropdown menu to pick one
            const options = customEmojis.slice(0, 25).map(e => ({
                label: e.name,
                value: `${e.id}|${e.name}|${e.animated ? 1 : 0}`, // encode data in value
                emoji: { id: e.id, animated: e.animated }
            }));
            
            const select = new StringSelectMenuBuilder()
                .setCustomId('Steal as Emoji_select')
                .setPlaceholder('Select an emoji to steal')
                .addOptions(options);
                
            const row = new ActionRowBuilder().addComponents(select);
            
            await interaction.reply({ content: `Multiple custom emojis found (${customEmojis.length}). Please select one:`, components: [row], ephemeral: true });
        }
    },
    
    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('Steal as Emoji_select')) return;
        const data = interaction.values[0].split('|');
        const emoji = {
            id: data[0],
            name: data[1],
            animated: data[2] === '1'
        };
        await this.showEmojiModal(interaction, emoji);
    },
    
    async showEmojiModal(interaction, emoji) {
        const modal = new ModalBuilder()
            .setCustomId(`Steal as Emoji_modal_${emoji.id}_${emoji.animated ? 1 : 0}`)
            .setTitle('Name the Stolen Emoji');
            
        const nameInput = new TextInputBuilder()
            .setCustomId('emojiNameInput')
            .setLabel('Emoji Name')
            .setRequired(true)
            .setValue(emoji.name) // prefilled
            .setStyle(TextInputStyle.Short);
            
        const row = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(row);
        
        await interaction.showModal(modal);
    },
    
    async handleModal(interaction) {
        if (!interaction.customId.startsWith('Steal as Emoji_modal_')) return;
        const parts = interaction.customId.split('_');
        const isAnimated = parts[parts.length - 1] === '1';
        const id = parts[parts.length - 2];
        const newName = interaction.fields.getTextInputValue('emojiNameInput');
        const url = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? 'gif' : 'png'}`;
        
        await interaction.deferReply({ ephemeral: true });
        try {
            const newEmoji = await interaction.guild.emojis.create({ attachment: url, name: newName });
            await interaction.editReply(`Successfully stolen as emoji: ${newEmoji} (\`${newEmoji.name}\`)`);
        } catch (error) {
            console.error(error);
            await interaction.editReply(`Failed to create emoji: ${error.message}`);
        }
    }
};
