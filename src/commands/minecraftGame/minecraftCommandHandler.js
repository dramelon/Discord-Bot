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
const { executeProfileLogic } = require('./profile');
const { executeInspectLogic, autocompleteInspectLogic } = require('./inspect');
const { executeHowToLogic } = require('./howto');

const SUBCOMMAND_DESCRIPTIONS = {
    'mine': 'Mine for resources using your equipped pickaxe',
    'tree': 'Chop trees to get wood and other drops',
    'craft': 'Craft items and tools from your resources',
    'inventory': 'Show your Minecraft game inventory',
    'equip': 'Equip a tool for mining',
    'smelt': 'Manage your furnace and smelt ores',
    'combine': 'Combine two tools to merge their durability',
    'repair': 'Repair a metal tool using its base material',
    'enchant': 'Enchant a tool using Levels and Lapis',
    'disenchant': 'Clear enchantments from a tool',
    'profile': 'Show a player\'s Minecraft profile and progress',
    'inspect': 'Wiki: Inspect items and tools for details',
    'howto': 'New to the game? Get a step-by-step guide!',
    'help': 'Get general information or help for a specific command'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('minecraft')
        .setDescription('Core command for the Minecraft-style game')
        .setContexts([0, 1, 2])
        .setIntegrationTypes([0, 1])
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
        .addSubcommand(subcommand =>
            subcommand
                .setName('profile')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.profile)
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check profile of')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('inspect')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.inspect)
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Item or tool to inspect')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('howto')
                .setDescription(SUBCOMMAND_DESCRIPTIONS.howto)
                .addStringOption(option =>
                    option.setName('step')
                        .setDescription('Select a specific tutorial step')
                        .setRequired(false)
                        .addChoices(
                            { name: '🌲 Step 1: Gathering Wood', value: 'gathering' },
                            { name: '⚒️ Step 2: Crafting Basics', value: 'crafting' },
                            { name: '⛏️ Step 3: Mining & Resources', value: 'mining' },
                            { name: '🔥 Step 4: Processing & Wiki', value: 'processing' }
                        )
                )
        ),

    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();


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

        if (subcommand === 'inspect') {
            return await autocompleteInspectLogic(interaction);
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

        // Global XP Gain - leveling.js handles notification if we pass interaction
        const { addPlayerXP } = require('./../../utils/minecraftData');
        addPlayerXP(userId, 1, interaction.user, interaction);



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

        if (subcommand === 'profile') {
            return await executeProfileLogic(interaction);
        }

        if (subcommand === 'inspect') {
            return await executeInspectLogic(interaction);
        }

        if (subcommand === 'howto') {
            return await executeHowToLogic(interaction);
        }

        if (subcommand === 'help') {
            const commandName = interaction.options.getString('command');

            if (!commandName) {
                const embed = new EmbedBuilder()
                    .setTitle('🎮 Minecraft Game: Ultimate Guide')
                    .setDescription('Welcome to the fluffin-powered Minecraft Discord experience! 🌟\nBuild your empire, master the elements, and become the top player on the leaderboard!')
                    .setColor(0x2ecc71)
                    .addFields(
                        {
                            name: '📈 Progression & Levels',
                            value: 'Gain **1 XP** for every chat message and command! As you level up, you\'ll unlock power for **Tool Enchanting**. Your level progress is global across the entire bot! 🌍'
                        },
                        {
                            name: '🏆 Achievements & Recipes',
                            value: 'Reach milestones to unlock **Advancements**! Each rank unlocks new **Recipes** and abilities. Check `/minecraft profile` to see your collection! 🎖️'
                        },
                        {
                            name: '⚔️ Core Features',
                            value: '• **Gathering**: `/minecraft tree` & `/minecraft mine`\n• **Economy**: `/minecraft craft` & `/minecraft smelt`\n• **Equipment**: `/minecraft equip`, `/minecraft repair` & `/minecraft enchant`'
                        },
                        {
                            name: '📖 Knowledge Base',
                            value: 'Confused about an item? Use **`/minecraft inspect <item>`** to view the in-game wiki with descriptions and sources!'
                        },
                        {
                            name: '🛠️ Subcommand List',
                            value: Object.entries(SUBCOMMAND_DESCRIPTIONS).map(([name, desc]) => `\`${name}\` - ${desc}`).join('\n')
                        }
                    )
                    .setFooter({ text: '💡 Use /minecraft help <command> for deep details on any action!' });

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
                case 'profile':
                    embed.setTitle('👤 Command: /minecraft profile')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.profile)
                        .addFields(
                            { name: 'Options', value: '`user`: (Optional) The player to check. Defaults to you.' },
                            { name: '📊 Included Data', value: 'Total Items, Tool Count, Advancements (Achievements), and Lifetime Stats.' }
                        );
                    break;
                case 'inspect':
                    embed.setTitle('📖 Command: /minecraft inspect')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.inspect)
                        .addFields(
                            { name: 'Options', value: '`item`: (Autocomplete) The item or tool to look up.' },
                            { name: '📝 Note', value: 'Includes descriptions, obtainment sources, and tool stats if applicable.' }
                        );
                    break;
                case 'howto':
                    embed.setTitle('📖 Command: /minecraft howto')
                        .setDescription(SUBCOMMAND_DESCRIPTIONS.howto)
                        .addFields(
                            { name: 'Options', value: '`step`: (Optional) Choose a part of the guide: `Gathering`, `Crafting`, `Mining`, or `Processing`.' },
                            { name: '💡 Tip', value: 'Run without options for the "New Player" starter guide!' }
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
