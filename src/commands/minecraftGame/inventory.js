const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayerData } = require('../../utils/minecraftData');

async function executeInventoryLogic(interaction) {
    const userId = interaction.user.id;
    const allData = getPlayerData(userId);
    const player = allData[userId];

    if (!player || !player.inventory || Object.keys(player.inventory).length === 0) {
        return await interaction.reply({ content: 'Your inventory is empty! Use `/minecraft tree` to get started.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
        .setColor(0x2ecc71)
        .setThumbnail(interaction.user.displayAvatarURL());

    const equippedPickId = player.equipped?.pickaxe;
    const tools = player.tools || [];

    const stackableItems = Object.entries(player.inventory)
        .filter(([_, amount]) => amount > 0)
        .map(([item, amount]) => `**${item.replace(/_/g, ' ')}**: ${amount}`)
        .join('\n');

    const toolItems = tools
        .map(t => {
            const isEquipped = t.id === equippedPickId;
            return `**${isEquipped ? '[E] ' : ''}${t.type.replace(/_/g, ' ')}** (${t.durability}/${t.maxDurability}) \`#${t.id}\``;
        })
        .join('\n');

    embed.addFields(
        { name: '📦 Items', value: stackableItems || '_No stackable items_', inline: true },
        { name: '🛠️ Tools', value: toolItems || '_No tools possessed_', inline: true }
    );

    if (player.inventory.furnace > 0) {
        const now = Date.now();
        const finishTime = player.last_smelt_finish || 0;
        let status = 'Ready';
        if (finishTime > now) {
            const rem = Math.ceil((finishTime - now) / 1000);
            status = `🔥 Smelting... (${rem}s left)`;
        }
        embed.addFields({ 
            name: '🔥 Furnace Status', 
            value: `Heat: ${player.furnace_heat?.toFixed(1) || 0} units\nStatus: ${status}` 
        });
    }

    if (player.stats) {
        embed.addFields({ name: '📊 Stats', value: `Trees Chopped: ${player.stats.trees_chopped || 0}\nBlocks Mined: ${player.stats.blocks_mined || 0}` });
    }

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Show your Minecraft game inventory (Standalone)')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1]),
    execute: executeInventoryLogic,
    executeInventoryLogic
};
