const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { fetchCurrentCommands, deployOne, deleteOne, redeployOne } = require('../../utils/commandDeployer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('command')
        .setDescription('Manage application slash commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('deploy')
                .setDescription('Deploy a new command from local files')
                .addStringOption(opt => opt.setName('target').setDescription('Command to deploy').setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('cleanup')
                .setDescription('Remove a command from Discord')
                .addStringOption(opt => opt.setName('target').setDescription('Command to delete').setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('redeploy')
                .setDescription('Instantly reload a command (cleanup + deploy)')
                .addStringOption(opt => opt.setName('target').setDescription('Command to redeploy').setAutocomplete(true).setRequired(true))
        ),

    async autocomplete(interaction) {
        const sub = interaction.options.getSubcommand();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        try {
            const currentCommands = await fetchCurrentCommands();
            const currentNames = currentCommands.map(c => c.name);
            
            // Use local commands from the client collection to avoid circular dependency
            const localCommands = interaction.client.commands;
            const localNames = Array.from(localCommands.keys());

            let choices = [];
            if (sub === 'deploy') {
                // Technically characters aren't "deployed" if they aren't on Discord
                // but we can only deploy what's in our local commands collection
                choices = localNames.filter(name => !currentNames.includes(name));
            } else if (sub === 'cleanup') {
                choices = currentNames;
            } else if (sub === 'redeploy') {
                choices = localNames;
            }

            const filtered = choices
                .filter(choice => choice.toLowerCase().includes(focusedValue))
                .slice(0, 25);

            await interaction.respond(filtered.map(c => ({ name: c, value: c })));
        } catch (error) {
            console.error('Autocomplete error in commandManager:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getString('target');
        const localCommands = interaction.client.commands;
        
        await interaction.deferReply();

        let result;
        if (sub === 'deploy') {
            result = await deployOne(target, localCommands);
        } else if (sub === 'cleanup') {
            result = await deleteOne(target);
        } else if (sub === 'redeploy') {
            result = await redeployOne(target, localCommands);
        }

        const embed = new EmbedBuilder()
            .setTimestamp();

        if (result.success) {
            embed.setTitle(`✅ Command ${sub} Success`)
                .setDescription(`Successfully ${sub}ed \`/${target}\` in **${result.duration}ms**.`)
                .setColor(0x2ecc71);
        } else {
            embed.setTitle(`❌ Command ${sub} Failed`)
                .setDescription(`Failed to ${sub} \`/${target}\`.\n\n**Error:**\n\`\`\`\n${result.error}\n\`\`\``)
                .addFields({ name: '⏱️ Time Taken', value: `${result.duration}ms` })
                .setColor(0xe74c3c);
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
