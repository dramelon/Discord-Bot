const { SlashCommandBuilder, EmbedBuilder, Collection } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../utils/minecraftData');

// Simple in-memory cooldown to avoid spamming the database unnecessarily
const cooldowns = new Collection();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tree')
        .setDescription('Chop down an oak tree for resources')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1]),

    async execute(interaction) {
        const userId = interaction.user.id;
        const cooldownAmount = 10000; // 10 seconds

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + cooldownAmount;
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return interaction.reply({ 
                    content: `Slow down! Your arms are tired. Try again in ${timeLeft.toFixed(1)}s.`, 
                    ephemeral: true 
                });
            }
        }

        // Apply cooldown
        cooldowns.set(userId, Date.now());
        setTimeout(() => cooldowns.delete(userId), cooldownAmount);

        // Roll the dice for loot
        const logsFound = Math.floor(Math.random() * (6 - 3 + 1)) + 3; // 3 to 6
        const sticksFound = Math.floor(Math.random() * 3); // 0 to 2
        const appleFound = Math.random() < 0.10 ? 1 : 0; // 10% chance

        // Update Database
        const allPlayerData = getPlayerData(userId);
        const player = allPlayerData[userId];

        player.inventory.oak_log += logsFound;
        player.inventory.stick += sticksFound;
        player.inventory.apple += appleFound;
        player.stats.trees_chopped += 1;

        savePlayerData(allPlayerData);

        // Create the Response Embed
        const embed = new EmbedBuilder()
            .setTitle('🪓 Timber!')
            .setDescription('You chopped down a sturdy oak tree.')
            .setColor(0x2ecc71) // Green
            .addFields(
                { name: '🪵 Logs', value: `+${logsFound}`, inline: true }
            );

        if (sticksFound > 0) {
            embed.addFields({ name: '🥢 Sticks', value: `+${sticksFound}`, inline: true });
        }
        if (appleFound > 0) {
            embed.addFields({ name: '🍎 Rare Find!', value: '+1 Apple', inline: true });
        }

        embed.setFooter({ text: `Total Logs: ${player.inventory.oak_log} | Total Trees Chopped: ${player.stats.trees_chopped}` });

        await interaction.reply({ embeds: [embed] });
    }
};