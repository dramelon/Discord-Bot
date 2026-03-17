const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { executeTreeLogic } = require('./tree');
const { executeInventoryLogic } = require('./inventory');
const { executeCraftLogic, autocompleteCraftLogic } = require('./craft');
const { executeMineLogic, autocompleteMineLogic } = require('./mine');
const { executeEquipLogic, autocompleteEquipLogic } = require('./equip');
const { executeSmeltLogic, autocompleteSmeltLogic } = require('./smelt');
const { executeCombineLogic, autocompleteCombineLogic } = require('./combine');
const { executeRepairLogic, autocompleteRepairLogic } = require('./repair');
const { executeEnchantLogic, autocompleteEnchantLogic } = require('./enchant');
const { executeDisenchantLogic, autocompleteDisenchantLogic } = require('./disenchant');
const { executeAdminLogic, autocompleteAdminLogic } = require('./admin');

const SUBCOMMAND_DESCRIPTIONS = {
    tree: 'Chop down an oak tree for resources',
    inventory: 'View your items and stats',
    craft: 'Open the crafting menu or craft items',
    mine: 'Mine for stone and shiny resources',
    equip: 'Equip or unequip a tool from your collection',
    smelt: 'Smelt raw ores into ingots using fuel',
    combine: 'Merge two tools of the same type to combine durability',
    repair: 'Repair a metal or stone tool using base materials',
    enchant: 'Use Level and Lapis to enchant a tool',
    disenchant: 'Clear all enchantments from a tool',
    admin: 'Privileged commands for game moderators',
    help: 'Get general information or help for a specific command'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('minecraft')
// ... existing code ...
        .addSubcommand(subcommand =>
            subcommand
                .setName('smelt')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.smelt)
                .addIntegerOption(option =>
                    option.setName('furnace')
                        .setDescription('The furnace number to manage directly')
                        .setMinValue(1)
                        .setRequired(false)
                )
        )
        .setDescription('Core command for the Minecraft-style game')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1])
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.help)
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('The specific command to get help for')
                        .setAutocomplete(true)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tree')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.tree)
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('inventory')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.inventory)
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('equip')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.equip)
                .addStringOption(option =>
                    option.setName('tool')
                        .setDescription('The tool you want to equip')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('mine')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.mine)
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Number of blocks to mine (default 1)')
                        .setMinValue(1)
                        .setMaxValue(1024)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('equip')
                        .setDescription('Select a pickaxe to equip')
                        .setAutocomplete(true)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('craft')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.craft)
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('The item to craft')
                        .setAutocomplete(true)
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('How many times to craft (default 1)')
                        .setMinValue(1)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('combine')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.combine)
                .addStringOption(option =>
                    option.setName('tool1')
                        .setDescription('The first tool to combine')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('tool2')
                        .setDescription('The second tool to combine')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('repair')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.repair)
                .addStringOption(option =>
                    option.setName('tool')
                        .setDescription('The tool you want to repair')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enchant')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.enchant)
                .addStringOption(option =>
                    option.setName('tool')
                        .setDescription('The tool you want to enchant')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disenchant')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.disenchant)
                .addStringOption(option =>
                    option.setName('tool')
                        .setDescription('The tool to clear enchantments from')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('admin')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.admin)
                .addSubcommand(sub =>
                    sub.setName('give_item')
                        .setDescription('Give an item to a user')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                        .addStringOption(opt => opt.setName('item').setDescription('Item ID').setAutocomplete(true).setRequired(true))
                        .addIntegerOption(opt => opt.setName('amount').setDescription('How many').setMinValue(1))
                )
                .addSubcommand(sub =>
                    sub.setName('remove_item')
                        .setDescription('Remove an item from a user')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                        .addStringOption(opt => opt.setName('item').setDescription('Item ID').setAutocomplete(true).setRequired(true))
                        .addIntegerOption(opt => opt.setName('amount').setDescription('How many').setMinValue(1))
                )
                .addSubcommand(sub =>
                    sub.setName('give_achievement')
                        .setDescription('Grant an achievement to a user')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                        .addStringOption(opt => opt.setName('achievement').setDescription('Advancement ID').setAutocomplete(true).setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName('remove_achievement')
                        .setDescription('Revoke an achievement from a user')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                        .addStringOption(opt => opt.setName('achievement').setDescription('Advancement ID').setAutocomplete(true).setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName('clear')
                        .setDescription('Clear a user\'s inventory')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName('hardreset')
                        .setDescription('Reset a user to level 0 and empty inventory')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName('enchant')
                        .setDescription('Enchant user\'s equipped tool')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                        .addStringOption(opt => opt.setName('enchantment').setDescription('Enchantment ID').setAutocomplete(true).setRequired(true))
                        .addIntegerOption(opt => opt.setName('level').setDescription('Level').setMinValue(1).setMaxValue(5).setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName('disenchant')
                        .setDescription('Disenchant user\'s equipped tool')
                        .addUserOption(opt => opt.setName('user').setDescription('The target user').setRequired(true))
                        .addStringOption(opt => opt.setName('enchantment').setDescription('Enchantment ID or "all"').setAutocomplete(true).setRequired(true))
                )
        ),

    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        if (group === 'admin') {
            return await autocompleteAdminLogic(interaction);
        }

        if (subcommand === 'craft') {
            return await autocompleteCraftLogic(interaction);
        }

        if (subcommand === 'mine') {
            return await autocompleteMineLogic(interaction);
        }

        if (subcommand === 'equip') {
            return await autocompleteEquipLogic(interaction);
        }

        if (subcommand === 'smelt') {
            return await autocompleteSmeltLogic(interaction);
        }

        if (subcommand === 'combine') {
            return await autocompleteCombineLogic(interaction);
        }

        if (subcommand === 'repair') {
            return await autocompleteRepairLogic(interaction);
        }

        if (subcommand === 'enchant') {
            return await autocompleteEnchantLogic(interaction);
        }

        if (subcommand === 'disenchant') {
            return await autocompleteDisenchantLogic(interaction);
        }

        if (subcommand === 'help') {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const commands = Object.keys(SUBCOMMAND_DESCRIPTIONS);
            const filtered = commands.filter(cmd => cmd.includes(focusedValue));
            await interaction.respond(
                filtered.map(cmd => ({ name: cmd, value: cmd }))
            );
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);
        const userId = interaction.user.id;

        // Global XP Gain
        const { addPlayerXP } = require('./../../utils/minecraftData');
        const levelUp = addPlayerXP(userId, 1, interaction.user); // 1 XP per command
        if (levelUp !== null) {
            // Small delay to ensure command response comes first or just followUp
            setTimeout(() => {
                interaction.followUp({ content: `🎊 **Level Up!** You are now level **${levelUp}**!`, ephemeral: true }).catch(() => {});
            }, 1000);
        }

        if (group === 'admin') {
            return await executeAdminLogic(interaction);
        }

        if (subcommand === 'tree') {
            return await executeTreeLogic(interaction);
        }

        if (subcommand === 'inventory') {
            return await executeInventoryLogic(interaction);
        }

        if (subcommand === 'craft') {
            return await executeCraftLogic(interaction);
        }

        if (subcommand === 'mine') {
            return await executeMineLogic(interaction);
        }

        if (subcommand === 'equip') {
            return await executeEquipLogic(interaction);
        }

        if (subcommand === 'smelt') {
            return await executeSmeltLogic(interaction);
        }

        if (subcommand === 'combine') {
            return await executeCombineLogic(interaction);
        }

        if (subcommand === 'repair') {
            return await executeRepairLogic(interaction);
        }

        if (subcommand === 'enchant') {
            return await executeEnchantLogic(interaction);
        }

        if (subcommand === 'disenchant') {
            return await executeDisenchantLogic(interaction);
        }

        if (subcommand === 'help') {
            const commandName = interaction.options.getString('command');

            if (!commandName) {
                const embed = new EmbedBuilder()
                    .setTitle('🎮 Minecraft Game Info')
                    .setDescription('Welcome to the Minecraft-inspired Discord game!')
                    .setColor(0x2ecc71)
                    .addFields(
                        { name: '🛠️ Available Subcommands', value: Object.entries(SUBCOMMAND_DESCRIPTIONS).map(([name, desc]) => `\`/minecraft ${name}\` - ${desc}`).join('\n') },
                        { name: '💡 Hint', value: 'Use `/minecraft help <command>` for detailed info on any action!' }
                    );

                return await interaction.reply({ embeds: [embed] });
            }

            const embed = new EmbedBuilder().setColor(0x5865F2);

            switch (commandName.toLowerCase()) {
                case 'tree':
                    embed.setTitle('🪓 Command: /minecraft tree')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.tree)
                        .addFields(
                            { name: '🪵 Potential Loot', value: '3-6 Oak Logs, 0-2 Sticks, and a 10% chance for an Apple.' },
                            { name: '⏳ Cooldown', value: '10 seconds' }
                        );
                    break;
                case 'inventory':
                    embed.setTitle('🎒 Command: /minecraft inventory')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.inventory)
                        .addFields(
                            { name: '📝 Note', value: 'Shows all items you currently own and your game stats.' }
                        );
                    break;
                case 'mine':
                    embed.setTitle('⛏️ Command: /minecraft mine')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.mine)
                        .addFields(
                            { name: 'Options', value: '`amount`: (1-1024) How many blocks to mine.\n`equip`: (Autocomplete) Instantly swap tools before mining.' },
                            { name: '💡 Tip', value: 'Equip better pickaxes to find shiny resources!' }
                        );
                    break;
                case 'equip':
                    embed.setTitle('⚔️ Command: /minecraft equip')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.equip)
                        .addFields(
                            { name: 'Param', value: '`tool`: (Autocomplete) Choose a tool from your inventory by ID and health.' },
                            { name: '💡 Tip', value: 'You can unequip by choosing "None" or swap tools instantly inside the `/minecraft mine` command!' }
                        );
                    break;
                case 'smelt':
                    embed.setTitle('🔥 Command: /minecraft smelt')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.smelt)
                        .addFields(
                            { name: 'UI Interaction', value: 'This command opens an interactive menu where you can manage all your furnaces at once.' },
                            { name: '💡 Tip', value: 'Every furnace you craft adds a new slot! You can load them with different materials and fuels to smelt in parallel.' }
                        );
                    break;
                case 'craft':
                    embed.setTitle('⚒️ Command: /minecraft craft')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.craft)
                        .addFields(
                            { name: 'Options', value: '`item`: (Autocomplete) The item to craft.\n`amount`: (Optional) Number of items to craft.' },
                            { name: '💡 Tip', value: 'Run `/minecraft craft` with no options to see all recipes!' }
                        );
                    break;
                case 'help':
                    embed.setTitle('❓ Command: /minecraft help')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.help);
                    break;
                default:
                    return await interaction.reply({ content: `Unknown command: \`${commandName}\`.`, ephemeral: true });
            }

            return await interaction.reply({ embeds: [embed] });
        }
    },
};
