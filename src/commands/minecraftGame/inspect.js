const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getToolTemplates } = require('../../utils/minecraftData');

const WIKI_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'wiki.json');

async function executeInspectLogic(interaction) {
    const item = interaction.options.getString('item').toLowerCase();
    
    if (!fs.existsSync(WIKI_FILE)) {
        return await interaction.reply({ content: "❌ Wiki database not found!", ephemeral: true });
    }

    const wiki = JSON.parse(fs.readFileSync(WIKI_FILE, 'utf8'));
    const templates = getToolTemplates();
    
    const entry = wiki[item];
    
    if (!entry) {
        return await interaction.reply({ content: `❌ No wiki entry found for **${item.replace(/_/g, ' ')}**.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`📖 Wiki: ${item.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`)
        .setColor(0x95a5a6)
        .setDescription(entry.description)
        .addFields(
            { name: '📍 Sources', value: entry.sources.join('\n') }
        );

    // If it's a tool, add stats
    if (templates[item]) {
        embed.addFields({ name: '⚒️ Tool Stats', value: `Durability: **${templates[item].durability}**\nMine Speed: **${templates[item].efficiency || 1}x**` });
    }

    await interaction.reply({ embeds: [embed] });
}

async function autocompleteInspectLogic(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    if (!fs.existsSync(WIKI_FILE)) return await interaction.respond([]);
    
    const wiki = JSON.parse(fs.readFileSync(WIKI_FILE, 'utf8'));
    const choices = Object.keys(wiki);
    const filtered = choices.filter(choice => choice.includes(focusedValue)).slice(0, 25);
    
    await interaction.respond(
        filtered.map(choice => ({ name: choice.replace(/_/g, ' '), value: choice }))
    );
}

module.exports = {
    executeInspectLogic,
    autocompleteInspectLogic
};
