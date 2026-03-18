const { EmbedBuilder } = require('discord.js');

const TUTORIAL_STEPS = {
    'gathering': {
        title: '🌲 Step 1: Gathering Wood',
        description: 'Every great journey starts with a single tree!',
        fields: [
            { name: '🪓 Chopping Trees', value: 'Use **`/minecraft tree`** to gather Oak Logs. This is your most important resource at the start!' },
            { name: '🍎 Extras', value: 'While chopping trees, you might also find **Sticks** and **Apples**.' },
            { name: '➡️ Ready to progress?', value: 'Once you have at least **4 Oak Logs**, you are ready for the next step! Use **`/minecraft howto step:⚒ Step 2: Crafting Basics`** to learn how to make your first tools.' }
        ],
        color: 0x2ecc71
    },
    'crafting': {
        title: '⚒️ Step 2: Crafting Basics',
        description: 'Time to turn that wood into something useful!',
        fields: [
            { name: '🪚 Making Planks', value: 'Use **`/minecraft craft`** and search for **Oak Planks**. You\'ll need these to build everything else!' },
            { name: '⚒️ The Crafting Table', value: 'Now, use **`/minecraft craft`** command again but this time we will search for **Crafting Table**. It allows you to create more complex items like tools.' },
            { name: '⛏️ Your First Tool', value: 'Craft a **Wooden Pickaxe** next! figured it out yourself how to craft it ;3.' },
            { name: '➡️ What\'s next?', value: 'Once you successfully crafted your very first pickaxe (or not?), head over to **`/minecraft howto step:⛏ Step 3: Mining & Resources`** to start digging!' }
        ],
        color: 0x3498db
    },
    'mining': {
        title: '⛏️ Step 3: Mining & Resources',
        description: 'Now that you have a pickaxe, it\'s time to go underground!',
        fields: [
            { name: '⚔️ Equip Your Tool', value: 'Before mining, make sure your pickaxe is equipped: **`/minecraft equip`** and choice the oickaxe you just craft.' },
            { name: '💎 Start Mining', value: 'Use **`/minecraft mine`** to find `Stone` and `Coal`. For `Raw Iron`, try crafting better pickaxes! i\'ll hint that you can make Stone Pickaxe after you got some stone.' },
            { name: '🛡️ Durability', value: 'Tools break! Keep an eye on your pickaxe health in **`/minecraft inventory`**. You can **`/minecraft repair`** equipping tools or **`/minecraft combine`** two used ones (make sure you not shattered them at latest durability).' },
            { name: '💡 Lazy Tip', value: 'You can equip tools directly inside the **`/minecraft mine`** command if you notice.' },
            { name: '➡️ Got raw iron now?', value: 'Go **`/minecraft howto step:🔥 Step 4: Processing & Wiki`** to learn how to smelt raw iron into iron ingots. You\'ll need fuel too like Coal or Wood!' }
        ],
        color: 0x1abc9c
    },
    'processing': {
        title: '🔥 Step 4: Processing & Wiki',
        description: 'Advanced mechanics for seasoned survivors.',
        fields: [
            { name: '🧱 Smelting', value: 'Craft a **Furnace** and use **`/minecraft smelt`** to turn raw ores like `Raw Iron` into `Ingots`. You\'ll need fuel like Coal or Wood!' },
            { name: '✨ Empowerment', value: 'Use **`/minecraft enchant`** to add bonuses to your tools using Levels and Lapis! (better learn about this later hehe~)' },
            { name: '📖 Knowledge', value: 'Confused about an item? Use **`/minecraft inspect`** to see the in-game wiki with obtainment methods and stats!' }
        ],
        color: 0xe67e22
    }
};

async function executeHowToLogic(interaction) {
    const step = interaction.options.getString('step');
    const embed = new EmbedBuilder();

    if (!step) {
        // Default "Basics" guide
        embed.setTitle('🎮 Welcome to Minecraft Discord!')
            .setDescription('New to the game? Here is how to get started from scratch!')
            .setColor(0x5865F2)
            .addFields(
                { name: '🌲 Step 1: Gathering Wood', value: 'Run **`/minecraft tree`** a few times to get logs. Wood is the foundation of everything!' },
                { name: '⚒️ Step 2: Crafting Basics', value: 'You can\'t build complex tools without a **Crafting Table**. Run **`/minecraft craft`** and search for `Crafting Table`.' },
                { name: '⛏️ Step 3: Mining & Resources', value: 'To go mining, you MUST have a pickaxe. Craft one: **`/minecraft craft`** and search for `Wooden Pickaxe`.' },
                { name: '🔥 Step 4: Processing & Wiki', value: 'Equip your tool with **`/minecraft equip`**, then run **`/minecraft mine`** to find stone and ores!' },
                { name: '💡 Pro Tip', value: 'Use **`/minecraft howto step:🌲 Step 1: Gathering Wood`** for more detailed steps, or **`/minecraft help`** for a command list.' }
            )
            .setFooter({ text: 'Tip: Check /minecraft profile to see your achievements!' });
    } else {
        const data = TUTORIAL_STEPS[step.toLowerCase()];
        if (!data) {
            return await interaction.reply({ content: "❌ Invalid tutorial step.", ephemeral: true });
        }
        embed.setTitle(data.title)
            .setDescription(data.description)
            .addFields(data.fields)
            .setColor(data.color);
    }

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    executeHowToLogic
};
