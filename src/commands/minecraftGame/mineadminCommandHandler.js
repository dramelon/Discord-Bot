const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { 
    getRecipes, 
    getToolTemplates, 
    getAdvancementData 
} = require('../../utils/minecraftData');

const ADMIN_ROLE_ID = '1466814634718658704';
const ENCHANTMENTS_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'enchantments.json');

// Import all subcommands
const subcommands = {};
const adminDir = path.join(__dirname, 'admin');
const commandFiles = fs.readdirSync(adminDir).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const subcommand = require(`./admin/${file}`);
    const name = file.split('.')[0];
    subcommands[name] = subcommand;
}

module.exports = {
    data: (() => {
        const builder = new SlashCommandBuilder()
            .setName('mineadmin')
            .setDescription('Admin-only commands to manage Minecraft game data')
            .setContexts([0, 1, 2])
            .setIntegrationTypes([0, 1]);

        for (const name in subcommands) {
            builder.addSubcommand(sub => subcommands[name].data(sub));
        }
        return builder;
    })(),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const sub = interaction.options.getSubcommand();

        if (focusedOption.name === 'item') {
            const recipes = getRecipes();
            const templates = getToolTemplates();
            const allItems = [...new Set([...Object.keys(recipes), ...Object.keys(templates), 'coal', 'iron_ingot', 'gold_ingot', 'lapis', 'redstone', 'diamond', 'raw_iron', 'raw_gold', 'cobblestone', 'stone'])];
            const filtered = allItems.filter(i => i.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
            await interaction.respond(filtered.map(i => ({ name: i.replace(/_/g, ' '), value: i })));
        }

        if (focusedOption.name === 'achievement') {
            const advs = getAdvancementData();
            const filtered = Object.keys(advs).filter(i => i.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
            await interaction.respond(filtered.map(i => ({ name: i, value: i })));
        }

        if (focusedOption.name === 'enchantment') {
            try {
                const enchantments = JSON.parse(fs.readFileSync(ENCHANTMENTS_FILE, 'utf8'));
                const choices = Object.keys(enchantments);
                if (sub === 'disenchant') choices.push('all');
                const filtered = choices.filter(i => i.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
                await interaction.respond(filtered.map(i => ({ name: i, value: i })));
            } catch (e) {
                await interaction.respond([]);
            }
        }
    },

    async execute(interaction) {
        // Permission check (Role or specific User ID)
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID) && interaction.user.id !== '389264086753345548') {
            return await interaction.reply({ content: "❌ You do not have permission to use admin commands.", ephemeral: true });
        }

        const subcommandName = interaction.options.getSubcommand();
        const subcommand = subcommands[subcommandName];

        if (!subcommand) {
            return await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
        }

        try {
            await subcommand.execute(interaction);
        } catch (error) {
            console.error(`Error executing admin subcommand ${subcommandName}:`, error);
            await interaction.reply({ content: "❌ An error occurred while executing the admin command.", ephemeral: true });
        }
    }
};
