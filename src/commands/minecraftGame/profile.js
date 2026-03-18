const { EmbedBuilder } = require('discord.js');
const { getPlayerData, getAdvancementData } = require('../../utils/minecraftData');
const { getUserLevelData } = require('../../leveling');

async function executeProfileLogic(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const userId = target.id;
    const allData = getPlayerData(userId);
    const player = allData[userId];
    const levelData = getUserLevelData(userId);
    const advancements = getAdvancementData();

    const achievementCount = player.advancements.length;
    const totalAchievements = Object.keys(advancements).length;
    
    const totalItems = Object.values(player.inventory).reduce((a, b) => a + b, 0);
    const toolCount = player.tools.length;

    const embed = new EmbedBuilder()
        .setTitle(`👤 Minecraft Profile: ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .setColor(0x3498db)
        .addFields(
            { name: '⭐ Progression', value: `Level: **${levelData.level}**\nTotal XP: **${levelData.totalXp}**`, inline: true },
            { name: '🏆 Achievements', value: `**${achievementCount}/${totalAchievements}** unlocked`, inline: true },
            { name: '📦 Resources', value: `Total Items: **${totalItems}**\nUnique Tools: **${toolCount}**`, inline: true }
        );

    if (player.stats) {
        const statsStr = [
            `🌴 Trees Chopped: **${player.stats.trees_chopped || 0}**`,
            `⛏️ Blocks Mined: **${player.stats.blocks_mined || 0}**`
        ].join('\n');
        embed.addFields({ name: '📊 Lifetime Stats', value: statsStr });
    }

    if (achievementCount > 0) {
        const achList = player.advancements
            .map(id => advancements[id] ? `• ${advancements[id].name}` : `• ${id}`)
            .slice(0, 10) // Show top 10
            .join('\n');
        
        const suffix = achievementCount > 10 ? `\n*...and ${achievementCount - 10} more*` : '';
        embed.addFields({ name: '🎖️ Recent Achievements', value: achList + suffix });
    } else {
        embed.addFields({ name: '🎖️ Achievements', value: '_No achievements yet! Get to work!_' });
    }

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    executeProfileLogic
};
