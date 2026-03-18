const { EmbedBuilder, Events } = require('discord.js');

const welcomeChannelId = '1483374462765236327';

const leaveMessages = [
    "The wind carries **user** away from the grove today. 🌬️ May your wings stay strong and your scales stay bright on your next journey. 🌈",
    "The hoard feels a little smaller now. 🪙 **user** has taken flight to distant lands. Safe travels, fellow dragon! ✈️",
    "A final flick of the tail and **user** is gone into the mist. 🌫️ You’ll always have a spot by the fire if you decide to fly back.",
    "Notification: **user** has officially concluded their stay in the sanctuary. 🦅 We wish you clear skies and warm updrafts on your path ahead.",
    "Sad dragon noises. 🥺 **user** has fluttered away from <#1483374462765236327>. We'll keep your seat in the cave warm just in case! 🪵"
];

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        // Send Leave Message
        const channel = member.guild.channels.cache.get(welcomeChannelId);
        if (channel) {
            const randomMsg = leaveMessages[Math.floor(Math.random() * leaveMessages.length)].replace('**user**', `**${member.user.tag}**`);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000) // Red
                .setDescription(randomMsg);
            
            await channel.send({ embeds: [embed] });
        }
    },
};
