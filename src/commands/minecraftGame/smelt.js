const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ComponentType,
    StringSelectMenuBuilder
} = require('discord.js');
const { getPlayerData, savePlayerData, getSmelteryData, tickFurnaces } = require('../../utils/minecraftData');

async function executeSmeltLogic(interaction) {
    const userId = interaction.user.id;
    let allPlayerData = getPlayerData(userId);
    let player = allPlayerData[userId];

    // Check if player owns any furnaces
    const furnaceCount = player.inventory.furnace || 0;
    if (furnaceCount <= 0) {
        return await interaction.reply({ 
            content: "❌ You don't own a **Furnace**! Craft one at the crafting table with 8 cobblestone.", 
            ephemeral: true 
        });
    }

    // Direct access if param provided
    const directFurnaceIdx = interaction.options.getInteger("furnace");
    let state = {
        view: directFurnaceIdx ? "manage" : "overview",
        furnaceIndex: directFurnaceIdx ? directFurnaceIdx - 1 : null,
        selectedType: null,
        selectedItem: null,
        message: null
    };

    if (directFurnaceIdx && (directFurnaceIdx < 1 || directFurnaceIdx > player.furnaces.length)) {
        return await interaction.reply({ content: `❌ Invalid furnace number. You have ${player.furnaces.length} slots.`, ephemeral: true });
    }

    const { recipes, fuels } = getSmelteryData();

    const renderUI = () => {
        // Refresh data before render
        allPlayerData = getPlayerData(userId);
        player = allPlayerData[userId];
        tickFurnaces(player);
        savePlayerData(allPlayerData); // Save after ticking to persist changes

        if (state.view === "overview") {
            const embed = new EmbedBuilder()
                .setTitle("🔥 Smeltery Overview")
                .setColor(0xe67e22)
                .setDescription(`You have **${player.furnaces.length}** furnace slot(s). Loading a furnace will consume materials from your inventory.`);

            const rows = [];
            player.furnaces.forEach((f, idx) => {
                let statusText = "❄️ **Idle**";
                let detailText = "_Click 'Manage' to load items_";

                if (f.input) {
                    const progress = (f.progressMs / 10000) * 100;
                    const bar = "▓".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));
                    statusText = `🔥 **Smelting** [${bar}] ${Math.floor(progress)}%`;
                    detailText = `📥 **Input**: ${f.input.amount}x ${f.input.item.replace(/_/g, " ")}\n⛽ **Fuel**: ${f.fuel ? `${f.fuel.amount}x ${f.fuel.item.replace(/_/g, " ")}` : "None"} (${f.currentHeat.toFixed(1)} heat cached)`;
                }

                if (f.result) {
                    detailText += `\n**Ready**: 📤 **${f.result.amount}x ${f.result.item.replace(/_/g, " ")}**`;
                }

                embed.addFields({ name: `Furnace #${idx + 1}`, value: `${statusText}\n${detailText}`, inline: false });

                // Distribute manage/collect buttons (max 5 buttons per row)
                // We'll put Manage and Collect (if exists) together
                if (rows.length === 0 || rows[rows.length-1].components.length > 3) {
                    rows.push(new ActionRowBuilder());
                }
                const currentRow = rows[rows.length - 1];
                
                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`smelt_manage_${idx}`)
                        .setLabel(`Manage #${idx + 1}`)
                        .setStyle(ButtonStyle.Primary)
                );

                if (f.result) {
                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`smelt_collect_${idx}`)
                            .setLabel(`Collect #${idx + 1}`)
                            .setStyle(ButtonStyle.Success)
                    );
                }
            });

            // Global Actions Row
            const globalRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("smelt_reload")
                    .setLabel("🔄 Reload")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("smelt_collect_all")
                    .setLabel("💰 Collect All")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!player.furnaces.some(f => f.result))
            );
            rows.push(globalRow);

            return { embeds: [embed], components: rows };

        } else if (state.view === "manage") {
            const furnace = player.furnaces[state.furnaceIndex];
            const embed = new EmbedBuilder()
                .setTitle(`🔥 Managing Furnace #${state.furnaceIndex + 1}`)
                .setColor(0xe67e22)
                .setDescription("Select a resource or fuel from your inventory to load.");

            if (furnace.input) embed.addFields({ name: "📥 Input", value: `${furnace.input.amount}x ${furnace.input.item.replace(/_/g, " ")}`, inline: true });
            if (furnace.fuel) embed.addFields({ name: "⛽ Fuel", value: `${furnace.fuel.amount}x ${furnace.fuel.item.replace(/_/g, " ")}`, inline: true });
            if (furnace.result) embed.addFields({ name: "📤 Result", value: `${furnace.result.amount}x ${furnace.result.item.replace(/_/g, " ")}`, inline: true });

            const inventoryItems = Object.entries(player.inventory).filter(([_, count]) => count > 0);
            const materialOptions = inventoryItems
                .filter(([key]) => recipes[key])
                .map(([key, count]) => ({ label: `${key.replace(/_/g, " ")} (Stock: ${count})`, value: `mat_${key}` }));
            const fuelOptions = inventoryItems
                .filter(([key]) => fuels[key] !== undefined)
                .map(([key, count]) => ({ label: `${key.replace(/_/g, " ")} (Stock: ${count})`, value: `fuel_${key}` }));

            const components = [];
            if (materialOptions.length > 0) {
                components.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("smelt_sel_mat").setPlaceholder("Select material...").addOptions(materialOptions.slice(0, 25))
                ));
            }
            if (fuelOptions.length > 0) {
                components.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("smelt_sel_fuel").setPlaceholder("Select fuel...").addOptions(fuelOptions.slice(0, 25))
                ));
            }
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("smelt_back").setLabel("Back to Overview").setStyle(ButtonStyle.Secondary)
            ));
            return { embeds: [embed], components };

        } else if (state.view === "amount") {
            const stock = player.inventory[state.selectedItem] || 0;
            const embed = new EmbedBuilder()
                .setTitle(`⚖️ Amount: ${state.selectedItem.replace(/_/g, " ")}`)
                .setDescription(`You have **${stock}x** available. How many to load?`)
                .setColor(0x3498db);

            const row = new ActionRowBuilder();
            [1, 8, 16, 64].filter(a => a <= stock).forEach(a => {
                row.addComponents(new ButtonBuilder().setCustomId(`amt_${a}`).setLabel(`${a}`).setStyle(ButtonStyle.Secondary));
            });
            row.addComponents(new ButtonBuilder().setCustomId("amt_all").setLabel(`All (${stock})`).setStyle(ButtonStyle.Primary));
            
            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("amt_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger)
            );
            return { embeds: [embed], components: [row, cancelRow] };
        }
    };

    const initial = renderUI();
    state.message = await interaction.reply({ ...initial, fetchReply: true });

    const collector = state.message.createMessageComponentCollector({ time: 300000 });

    collector.on("collect", async i => {
        if (i.user.id !== userId) return i.reply({ content: "Not your session!", ephemeral: true });

        // Logic branching based on customId
        if (i.isStringSelectMenu()) {
            const val = i.values[0];
            state.selectedType = val.startsWith("mat_") ? "mat" : "fuel";
            state.selectedItem = val.replace("mat_", "").replace("fuel_", "");
            state.view = "amount";
            return await i.update(renderUI());
        }

        const id = i.customId;

        // Overview Buttons
        if (id.startsWith("smelt_manage_")) {
            state.furnaceIndex = parseInt(id.split("_")[2]);
            state.view = "manage";
        } else if (id.startsWith("smelt_collect_")) {
            const idx = parseInt(id.split("_")[2]);
            const furnace = player.furnaces[idx];
            if (furnace.result) {
                const item = furnace.result.item;
                const amount = furnace.result.amount;
                player.inventory[item] = (player.inventory[item] || 0) + amount;
                
                // Check Advancements
                const newAdvs = checkAdvancements(player, item);
                
                furnace.result = null;
                savePlayerData({ [userId]: player });

                let msg = `✅ Collected **${amount}x ${item.replace(/_/g, " ")}**!`;
                await i.reply({ content: msg, ephemeral: true });

                if (newAdvs.length > 0) {
                    for (const adv of newAdvs) {
                        const advEmbed = new EmbedBuilder()
                            .setTitle("🏆 Advancement Reached!")
                            .setDescription(`**${adv.name}**\n*${adv.description}*`)
                            .addFields({ name: "🔓 Unlocked Recipes", value: adv.unlocks.join(", ").replace(/_/g, " ") })
                            .setColor(0xf1c40f);
                        await i.followUp({ embeds: [advEmbed] });
                    }
                }
            }
        } else if (id === "smelt_collect_all") {
            let collectedCount = 0;
            let totalAchievements = [];
            player.furnaces.forEach(f => {
                if (f.result) {
                    const item = f.result.item;
                    const amount = f.result.amount;
                    player.inventory[item] = (player.inventory[item] || 0) + amount;
                    
                    const newAdvs = checkAdvancements(player, item);
                    newAdvs.forEach(a => totalAchievements.push(a));
                    
                    f.result = null;
                    collectedCount++;
                }
            });
            if (collectedCount > 0) {
                savePlayerData({ [userId]: player });
                await i.reply({ content: `✅ Collected items from **${collectedCount}** furnaces!`, ephemeral: true });
                
                if (totalAchievements.length > 0) {
                    for (const adv of totalAchievements) {
                        const advEmbed = new EmbedBuilder()
                            .setTitle("🏆 Advancement Reached!")
                            .setDescription(`**${adv.name}**\n*${adv.description}*`)
                            .addFields({ name: "🔓 Unlocked Recipes", value: adv.unlocks.join(", ").replace(/_/g, " ") })
                            .setColor(0xf1c40f);
                        await i.followUp({ embeds: [advEmbed] });
                    }
                }
            } else {
                await i.reply({ content: "Nothing to collect!", ephemeral: true });
            }
        } else if (id === "smelt_reload") {
            // Already handled by the automatic update at the end
        } else if (id === "smelt_back") {
            state.view = "overview";
        } else if (id === "amt_cancel") {
            state.view = "manage";
        } else if (id.startsWith("amt_")) {
            const stock = player.inventory[state.selectedItem] || 0;
            const amount = id === "amt_all" ? stock : parseInt(id.split("_")[1]);
            const furnace = player.furnaces[state.furnaceIndex];

            if (stock >= amount && amount > 0) {
                player.inventory[state.selectedItem] -= amount;
                if (state.selectedType === "mat") {
                    furnace.input = { item: state.selectedItem, amount: (furnace.input?.amount || 0) + amount };
                } else {
                    furnace.fuel = { item: state.selectedItem, amount: (furnace.fuel?.amount || 0) + amount };
                }
                furnace.lastTick = Date.now();
                savePlayerData({ [userId]: player });
                await i.reply({ content: `✅ Loaded **${amount}x ${state.selectedItem.replace(/_/g, " ")}**!`, ephemeral: true });
            } else {
                await i.reply({ content: "❌ Not enough stock!", ephemeral: true });
            }
            state.view = "manage";
        }

        // Update the main UI
        try {
            if (i.deferred || i.replied) {
                await interaction.editReply(renderUI());
            } else {
                await i.update(renderUI());
            }
        } catch (e) {
            console.error("UI Update Error:", e);
        }
    });
}

async function autocompleteSmeltLogic(interaction) {
    await interaction.respond([]);
}

module.exports = {
    executeSmeltLogic,
    autocompleteSmeltLogic
};