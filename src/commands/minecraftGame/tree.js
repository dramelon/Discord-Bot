const { SlashCommandBuilder, EmbedBuilder, Collection } = require('discord.js');
const { getPlayerData, savePlayerData } = require('../../utils/minecraftData');

// Simple in-memory cooldown to avoid spamming the database unnecessarily
const cooldowns = new Collection();

async function executeTreeLogic(interaction) {
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
	let logsFound;
	const roll = Math.random();

	if (roll < 0.05) { // 5% chance
		logsFound = 9;
	} else if (roll < 0.30) { // 25% chance (0.05 to 0.299...)
		logsFound = Math.floor(Math.random() * 2) + 7; // 7 or 8
	} else if (roll < 0.90) { // 60% chance (0.30 to 0.899...)
		logsFound = Math.floor(Math.random() * 2) + 5; // 5 or 6
	} else { // 10% chance (0.90 to 0.999...)
		logsFound = 4;
	}

    const sticksFound = Math.floor(Math.random() * 3); // 0 to 2
    const appleFound = Math.random() < 0.10 ? 1 : 0; // 10% chance

    // Update Database
    const { getPlayerData, savePlayerData, checkAdvancements, broadcastAchievement } = require('../../utils/minecraftData');
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    player.inventory.oak_log += logsFound;
    player.inventory.stick += sticksFound;
    player.inventory.apple += appleFound;
    player.stats.trees_chopped += 1;

    // Check Advancements
    const newAchievements = checkAdvancements(player, 'oak_log');

    savePlayerData(allPlayerData);

    // Create the Response Embed
    const embed = new EmbedBuilder()
        .setTitle('🪓 Timber!')
        .setDescription('You chopped down a sturdy oak tree.')
        .setColor(0x2ecc71); // Green

    embed.addFields(
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

    if (newAchievements.length > 0) {
        for (const adv of newAchievements) {
            await broadcastAchievement(interaction, interaction.user, adv);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tree')
        .setDescription('Chop down an oak tree for resources')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1]),
    execute: executeTreeLogic,
    executeTreeLogic // Exported for use in minecraftCommandHandler.js
};