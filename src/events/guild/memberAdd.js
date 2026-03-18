const { EmbedBuilder, Events } = require('discord.js');

const welcomeChannelId = '1483374462765236327';
const initialRoleId = '1483509124678287491';

const welcomeMessages = [
    "Halt! 🛡️ A new dragon approaches the clearing. <@user>, please present your scales for inspection and find a cozy spot in the hoard. We are honored by your presence! ✨",
    "Warning: High levels of cuteness detected! 🐲 <@user> has fluttered into the den. Prepare for mandatory wing-hugs and a formal seat at the council table. 🫂",
    "Our treasure pile just grew by one! 💎 <@user>, welcome to the nest. Please keep your tail tucked and your heart open—we’re glad you’re here. ❤️",
    "Look up! A majestic new flier has landed. ☁️ <@user>, welcome to the sanctuary. May your stay be filled with warm breezes and plenty of shiny things. 🎐",
    "Is it getting warm in here, or is that just <@user>? 🔥 Welcome to the fire-pit! Feel free to roast some marshmallows while we get you settled in. 🍢",
    "Greetings, traveler. 📜 <@user> has officially joined our flight. Your arrival has been noted in the Great Ledger of Draconic Dorks. Make yourself at home!",
    "Crack! A new egg has hatched. 🥚 <@user> has stumbled into the world! Let's help this new dragon find their wings and a comfortable pile of gold. 🐾",
    "By order of the Dragon Council, <@user> is hereby recognized as a member of this hoard. 👑 Please enjoy the hospitality and try not to singe the curtains. 🕯️",
    "Who dares wake the slumbering... oh! 💤 It’s just <@user>. You’re far too cute to be a threat. Welcome to the den, little spark! ⚡",
    "The leaves rustle in greeting! 🍃 <@user> has found the hidden path to our grove. Welcome to the family—stay a while and share your stories. 🌲"
];

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Add Role
        try {
            await member.roles.add(initialRoleId);
        } catch (error) {
            console.error(`Error adding initial role to ${member.user.tag}:`, error);
        }

        // Send Welcome Message
        const channel = member.guild.channels.cache.get(welcomeChannelId);
        if (channel) {
            const randomMsg = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)].replace('<@user>', `<@${member.user.id}>`);
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Green
                .setDescription(randomMsg);
            
            await channel.send({ embeds: [embed] });
        }
    },
    // Adding extra export for Leave event to be handled by the same file logic if needed, 
    // but typically each event is its own file in such structures.
    // I'll create a separate file for memberRemove for clarity if the bot follows that pattern.
};
