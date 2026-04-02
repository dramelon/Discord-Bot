const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require('discord.js');
const { 
    getPlayerData, 
    savePlayerData, 
    getToolDisplayName,
    autocompleteToolHelper 
} = require('../../utils/minecraftData');
const { 
    getUserLevelData, 
    removeLevel 
} = require('../../leveling');
const fs = require('fs');
const path = require('path');

const ENCHANTMENTS_FILE = path.join(process.cwd(), 'data', 'minecraft', 'core', 'enchantments.json');

async function executeEnchantLogic(interaction) {
    const userId = interaction.user.id;
    const toolId = interaction.options.getString('tool');

    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    if (!player.advancements || !player.advancements.includes('lapis_or_lapiz')) {
        return await interaction.reply({ 
            content: '❌ You don\'t have enough skill to use the enchanting table yet! You need the achievement **"Lapis or Lapiz?... whatever"**.\n💡 **Hint:** Try getting at least one **Lapis Lazuli** first and come back later!',
            ephemeral: true 
        });
    }

    const userLevelData = getUserLevelData(userId);
    const userLevel = userLevelData.level;

    const toolIndex = player.tools.findIndex(t => t.id === toolId);
    if (toolIndex === -1) {
        return await interaction.reply({ content: '❌ That tool no longer exists.', ephemeral: true });
    }

    const tool = player.tools[toolIndex];
    if (tool.enchantments && Object.keys(tool.enchantments).length > 0) {
        return await interaction.reply({ content: '❌ This tool is already enchanted!', ephemeral: true });
    }

    const enchantmentsData = JSON.parse(fs.readFileSync(ENCHANTMENTS_FILE, 'utf8'));
    const { tier_config, ...enchantments } = enchantmentsData;
    const enchantList = Object.keys(enchantments);

    // Determine visible tiers: Met requirements + 1 locked tier
    const visibleTiers = [];
    let firstLockedFound = false;
    for (let i = 1; i <= 12; i++) {
        const config = tier_config[i];
        if (userLevel >= config.req_level) {
            visibleTiers.push({ id: i, ...config, locked: false });
        } else if (!firstLockedFound) {
            visibleTiers.push({ id: i, ...config, locked: true });
            firstLockedFound = true;
        } else {
            break;
        }
    }

    // Pre-calculate clues for the embed
    const tierClues = {};
    visibleTiers.forEach(t => {
        const randomEnchant = enchantList[Math.floor(Math.random() * enchantList.length)];
        tierClues[t.id] = enchantments[randomEnchant].clue;
    });

    const embed = new EmbedBuilder()
        .setTitle('🔮 Ancient Enchanting Table')
        .setColor(0x9b59b6)
        .setDescription(`Magical glyphs float around your **${getToolDisplayName(tool)}**. Choose a tier to infuse it with power.`)
        .addFields(
            { name: '⚒️ Selected Tool', value: getToolDisplayName(tool), inline: false },
            { name: '✨ Available Tiers', value: visibleTiers.map(t => 
                `${t.locked ? '🔒' : '✅'} **Tier ${t.id}**: Req Lvl ${t.req_level} | Cost: ${t.cost} Lvl/Lapis | *Wait for ${tierClues[t.id]}*...`
            ).join('\n'), inline: false }
        )
        .setFooter({ text: `Current Level: ${userLevel} | Lapis: ${player.inventory.lapis || 0}` });

    // Buttons
    const rows = [];
    let currentRow = new ActionRowBuilder();
    
    visibleTiers.forEach((t, idx) => {
        if (idx > 0 && idx % 5 === 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        
        const emoji = t.id <= 4 ? '✨' : (t.id <= 8 ? '🌟' : '🔮');
        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`enchant_tier_${t.id}`)
                .setLabel(`Tier ${t.id}`)
                .setEmoji(emoji)
                .setStyle(t.locked ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(t.locked)
        );
    });
    rows.push(currentRow);

    // Cancel Button on new row
    const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('enchant_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
    );
    rows.push(cancelRow);

    const response = await interaction.reply({ 
        embeds: [embed], 
        components: rows 
    });

    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
    });

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return await i.reply({ content: '❌ This menu is not for you!', ephemeral: true });
        }

        if (i.customId === 'enchant_cancel') {
            await i.update({ content: '📤 Enchantment cancelled.', embeds: [], components: [] });
            return collector.stop();
        }

        const tierId = i.customId.split('_').pop();
        const config = tier_config[tierId];
        const currentLevelData = getUserLevelData(userId);

        if (currentLevelData.level < config.req_level) {
            return await i.reply({ content: `❌ You need at least **Level ${config.req_level}** for Tier ${tierId}!`, ephemeral: true });
        }
        if ((player.inventory.lapis || 0) < config.cost) {
            return await i.reply({ content: `❌ You need **${config.cost}x Lapis Lazuli** for Tier ${tierId}!`, ephemeral: true });
        }

        // --- ENCHANT LOGIC ---
        removeLevel(userId, config.cost);
        player.inventory.lapis -= config.cost;

        const selectedEnchants = {};
        const available = [...enchantList];
        
        let enchantCount = 1;
        for (let j = 1; j < config.max_enchants; j++) {
            if (Math.random() < config.extra_chance) enchantCount++;
        }

        for (let j = 0; j < enchantCount; j++) {
            if (available.length === 0) break;
            const totalWeight = available.reduce((sum, key) => sum + enchantments[key].weight, 0);
            let random = Math.random() * totalWeight;
            let selected = available[0];
            for (const key of available) {
                if (random < enchantments[key].weight) {
                    selected = key;
                    break;
                }
                random -= enchantments[key].weight;
            }
            
            // Power logic: Tier 1-2 (I-II), Tier 3-4 (I-III), Tier 5-6 (I-IV), Tier 7-12 (I-V)
            let maxPower = Math.ceil(parseInt(tierId) / 2) + 1;
            if (tierId >= 7) maxPower = 5;
            
            const power = Math.min(Math.floor(Math.random() * maxPower) + 1, enchantments[selected].max_level);
            selectedEnchants[selected] = power;
            
            // Remove from available to ensure uniqueness
            available.splice(available.indexOf(selected), 1);

            // Handle Incompatibilities
            if (selected === 'Silk Touch') {
                const fortuneIdx = available.indexOf('Fortune');
                if (fortuneIdx !== -1) available.splice(fortuneIdx, 1);
                const autoSmeltIdx = available.indexOf('Auto Smelt');
                if (autoSmeltIdx !== -1) available.splice(autoSmeltIdx, 1);
            } else if (selected === 'Fortune' || selected === 'Auto Smelt') {
                const silkIdx = available.indexOf('Silk Touch');
                if (silkIdx !== -1) available.splice(silkIdx, 1);
            }
        }

        tool.enchantments = selectedEnchants;
        tool.timesEnchanted = (tool.timesEnchanted || 0) + 1;
        savePlayerData(allPlayerData);

        const clues = Object.entries(selectedEnchants)
            .slice(0, config.clue_count)
            .map(([name, _]) => enchantments[name].clue)
            .join(', ');

        const resultEmbed = new EmbedBuilder()
            .setTitle(`✨ Tier ${tierId} Enchantment Successful`)
            .setColor(0x9b59b6)
            .setDescription(`The enchanting table whispers ancient secrets of **${clues}**...`)
            .addFields(
                { name: '⚒️ Tool', value: getToolDisplayName(tool), inline: true },
                { name: '🔮 Power', value: Object.entries(selectedEnchants).map(([n, l]) => `**${n} ${'I'.repeat(l)}**`).join('\n'), inline: true },
                { name: '📉 Cost', value: `${config.cost} Levels & ${config.cost} Lapis`, inline: true }
            )
            .setFooter({ text: `Current Level: ${getUserLevelData(userId).level}` });

        await i.update({ embeds: [resultEmbed], components: [] });
        collector.stop();
    });

    collector.on('end', (collection, reason) => {
        if (reason === 'time' && collection.size === 0) {
            interaction.editReply({ components: [] }).catch(() => {});
        }
    });
}

async function autocompleteEnchantLogic(interaction) {
    await autocompleteToolHelper(interaction, t => !t.enchantments || Object.keys(t.enchantments).length === 0);
}

module.exports = {
    executeEnchantLogic,
    autocompleteEnchantLogic
};
