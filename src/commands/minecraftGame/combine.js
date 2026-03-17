const { EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, autocompleteToolHelper } = require('../../utils/minecraftData');

async function executeCombineLogic(interaction) {
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    const id1 = interaction.options.getString('tool1');
    const id2 = interaction.options.getString('tool2');

    if (id1 === id2) {
        return await interaction.reply({ content: "❌ You cannot combine the same tool!", ephemeral: true });
    }

    const tool1Index = player.tools.findIndex(t => t.id === id1);
    const tool2Index = player.tools.findIndex(t => t.id === id2);

    if (tool1Index === -1 || tool2Index === -1) {
        return await interaction.reply({ content: "❌ One or both of the selected tools no longer exist.", ephemeral: true });
    }

    const tool1 = player.tools[tool1Index];
    const tool2 = player.tools[tool2Index];

    if (tool1.type !== tool2.type) {
        return await interaction.reply({ content: "❌ You can only combine two tools of the same type!", ephemeral: true });
    }

    // Combine durability + 5% bonus
    const bonus = Math.floor(tool1.maxDurability * 0.05);
    const newDurability = Math.min(tool1.durability + tool2.durability + bonus, tool1.maxDurability);

    const oldDurability1 = tool1.durability;
    const oldDurability2 = tool2.durability;

    // Update tool1
    tool1.durability = newDurability;

    // Remove tool2
    player.tools.splice(tool2Index, 1);

    // If tool2 was equipped, unequip it
    if (player.equipped.pickaxe === id2) {
        player.equipped.pickaxe = null;
    }

    savePlayerData(allPlayerData);

    const embed = new EmbedBuilder()
        .setTitle("⚒️ Tools Combined")
        .setColor(0x2ecc71)
        .setDescription(`Successfully merged two **${tool1.type.replace(/_/g, ' ')}**s!`)
        .addFields(
            { name: "📊 New Durability", value: `\`${newDurability}/${tool1.maxDurability}\` (+${bonus} bonus)`, inline: true },
            { name: "📉 Combined", value: `\`${oldDurability1}\` + \`${oldDurability2}\``, inline: true }
        );

    await interaction.reply({ embeds: [embed] });
}

async function autocompleteCombineLogic(interaction) {
    await autocompleteToolHelper(interaction);
}

module.exports = {
    executeCombineLogic,
    autocompleteCombineLogic
};
