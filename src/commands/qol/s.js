const { SlashCommandBuilder } = require('discord.js');
const stickerCommand = require('./sticker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('s')
        .setDescription('Shortcut to use a sticker')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Sticker name')
                .setAutocomplete(true)
                .setRequired(true)),

    async autocomplete(interaction) {
        await stickerCommand.autocomplete(interaction);
    },

    async execute(interaction) {
        // We override the interaction logic slightly to make it work as a top-level command
        // instead of a subcommand call, but the logic is the same.
        // The handleUse expects interaction.options.getString('name')
        await stickerCommand.handleUse(interaction);
    }
};
