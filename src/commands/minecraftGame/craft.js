const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayerData, savePlayerData, getRecipes } = require('../../utils/minecraftData');

async function autocompleteCraftLogic(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const recipes = getRecipes();
    const userId = interaction.user.id;
    const player = getPlayerData(userId)[userId];
    
    const unlocked = Object.keys(recipes).filter(r => player.unlocked_recipes && player.unlocked_recipes.includes(r));
    const choices = unlocked.map(key => ({ 
        name: recipes[key].name, 
        value: key 
    }));

    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
    await interaction.respond(filtered.slice(0, 25));
}

async function executeCraftLogic(interaction) {
    const recipes = getRecipes();
    const itemKey = interaction.options.getString('item');
    const amount = interaction.options.getInteger('amount') || 1;
    const userId = interaction.user.id;
    const allPlayerData = getPlayerData(userId);
    const player = allPlayerData[userId];

    if (!itemKey) {
        const unlocked = Object.keys(recipes).filter(r => player.unlocked_recipes && player.unlocked_recipes.includes(r));
        
        const embed = new EmbedBuilder()
            .setTitle('⚒️ Crafting Recipes')
            .setColor(0x3498db)
            .setDescription(unlocked.length > 0 
                ? 'Here are the items you can craft:' 
                : 'You don\'t know any recipes yet! 🪵 Go chop some wood to get started.');

        if (unlocked.length > 0) {
            for (const key of unlocked) {
                const itemData = recipes[key];
                let recipeStrs = [];
                itemData.recipes.forEach((r, idx) => {
                    const ingredients = Object.entries(r.ingredients)
                        .map(([ing, count]) => `${count}x ${ing.replace(/_/g, ' ')}`)
                        .join(', ');
                    const req = r.requires ? ` [Needs: ${r.requires.replace(/_/g, ' ')}]` : '';
                    recipeStrs.push(`**Option ${idx + 1}:** ${ingredients}${req}`);
                });

                embed.addFields({ 
                    name: `${itemData.name} (yields ${itemData.recipes[0].result_amount})`, 
                    value: recipeStrs.join('\n'), 
                    inline: false 
                });
            }
        } else {
            embed.addFields({ name: '💡 Hint', value: 'Try `/minecraft tree` to unlock your first recipes!' });
        }

        return await interaction.reply({ embeds: [embed] });
    }

    if (!player.unlocked_recipes || !player.unlocked_recipes.includes(itemKey)) {
        return await interaction.reply({ content: '❌ You haven\'t unlocked this recipe yet!', ephemeral: true });
    }

    const itemData = recipes[itemKey];
    if (!itemData) {
        return await interaction.reply({ content: `Unknown item: \`${itemKey}\`.`, ephemeral: true });
    }

    let validRecipe = null;
    let failureReasons = [];

    // Try to find a valid recipe pathway
    for (const recipe of itemData.recipes) {
        // 1. Check prerequisites
        if (recipe.requires) {
            const hasRequiredItem = (player.inventory[recipe.requires] || 0) > 0;
            if (!hasRequiredItem) {
                failureReasons.push({ type: 'PREREQ', item: recipe.requires, recipe });
                continue;
            }
        }

        // 2. Check ingredients
        let hasAllIngredients = true;
        let requirementsList = [];
        for (const [ing, count] of Object.entries(recipe.ingredients)) {
            const required = count * amount;
            const current = player.inventory[ing] || 0;
            const missing = Math.max(0, required - current);
            if (missing > 0) hasAllIngredients = false;
            requirementsList.push({ name: ing.replace(/_/g, ' '), required, current, missing });
        }

        if (!hasAllIngredients) {
            failureReasons.push({ type: 'INGREDIENTS', list: requirementsList, recipe });
            continue;
        }

        // If we reach here, the recipe is valid!
        validRecipe = recipe;
        break;
    }

    if (!validRecipe) {
        // Handle failure - show the "best" failure reason (usually first or most relevant)
        const bestFailure = failureReasons[0]; // For now, just show the first failure reason

        if (bestFailure.type === 'PREREQ') {
            const req = bestFailure.item;
            let steps = [];
            if (req === 'crafting_table') {
                const hasPlanks = (player.inventory['oak_planks'] || 0) >= 4;
                const hasLogs = (player.inventory['oak_log'] || 0) > 0;
                if (!hasPlanks && !hasLogs) steps.push('**Step 1:** Get Oak Logs by running `/minecraft tree`');
                if (!hasPlanks) steps.push(`**Step ${steps.length + 1}:** Craft Oak Planks with \`/minecraft craft item:oak_planks\``);
                steps.push(`**Step ${steps.length + 1}:** Craft a Crafting Table with \`/minecraft craft item:crafting_table\``);
            } else {
                steps.push(`Craft a **${req.replace(/_/g, ' ')}** first!`);
            }

            const embed = new EmbedBuilder()
                .setTitle('🚧 Progression Needed')
                .setDescription(`You need a **${req.replace(/_/g, ' ')}** for this recipe option. Follow these steps:`)
                .setColor(0xe67e22)
                .addFields({ name: 'Roadmap', value: steps.join('\n') });

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (bestFailure.type === 'INGREDIENTS') {
            const embed = new EmbedBuilder()
                .setTitle('❌ Crafting Failed: Missing Materials')
                .setDescription(`You don't have enough resources for **${amount}x ${itemData.name}**.`)
                .setColor(0xe74c3c);

            let requirementStr = '';
            let inventoryStr = '';
            let missingStr = '';

            bestFailure.list.forEach(req => {
                requirementStr += `${req.required}x ${req.name}\n`;
                inventoryStr += `${req.current}x ${req.name}\n`;
                missingStr += req.missing > 0 ? `**${req.missing}x ${req.name}**\n` : '_-_\n';
            });

            embed.addFields(
                { name: '📋 Required', value: requirementStr, inline: true },
                { name: '🎒 You Have', value: inventoryStr, inline: true },
                { name: '⚠️ Missing', value: missingStr, inline: true }
            );

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // Process valid recipe
    for (const [ing, count] of Object.entries(validRecipe.ingredients)) {
        player.inventory[ing] -= (count * amount);
    }

    const totalYield = validRecipe.result_amount * amount;
    const isTool = itemKey.includes('pickaxe');
    
    if (isTool) {
        const { getToolTemplates } = require('../../utils/minecraftData');
        const toolTemplates = getToolTemplates();
        const template = toolTemplates[itemKey];

        for (let i = 0; i < totalYield; i++) {
            const toolId = Math.random().toString(36).substring(2, 9);
            player.tools.push({
                id: toolId,
                type: itemKey,
                durability: template ? template.durability : 100,
                maxDurability: template ? template.durability : 100
            });
        }
    } else {
        player.inventory[itemKey] = (player.inventory[itemKey] || 0) + totalYield;
    }

    savePlayerData(allPlayerData);

    const embed = new EmbedBuilder()
        .setTitle('⚒️ Crafting Successful!')
        .setDescription(`You crafted **${totalYield}x ${itemData.name}**!`)
        .setColor(0x2ecc71);

    const ingredientList = Object.entries(validRecipe.ingredients)
        .map(([ing, count]) => `-${count * amount}x ${ing.replace(/_/g, ' ')}`)
        .join('\n');
    
    embed.addFields({ name: 'Resources Used', value: ingredientList });

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('craft')
        .setDescription('Craft items (Standalone)')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1])
        .addStringOption(option =>
            option.setName('item')
                .setDescription('The item you want to craft')
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('How many to craft (default 1)')
                .setMinValue(1)
        ),
    execute: executeCraftLogic,
    autocomplete: autocompleteCraftLogic,
    executeCraftLogic,
    autocompleteCraftLogic
};
