const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { generateMathProblem } = require('../../utils/math');

const verificationCooldowns = new Map();
const userQuestions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Setup the verification system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const targetChannelId = '1483501813855686747';
        const channel = interaction.guild.channels.cache.get(targetChannelId);

        if (!channel) {
            return interaction.reply({ content: `Could not find channel with ID ${targetChannelId}.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('Verification Required')
            .setDescription('To access the rest of the server, please click the button below to verify yourself with a simple math question.')
            .setColor('#2b2d31');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Primary)
            );

        await channel.send({ embeds: [embed], components: [row] });

        return interaction.reply({ content: `Verification system setup in <#${targetChannelId}>.`, ephemeral: true });
    },

    async handleButton(interaction) {
        if (interaction.customId !== 'verify_button') return;

        const userId = interaction.user.id;
        const now = Date.now();
        const cooldownAmount = 10 * 1000;

        if (verificationCooldowns.has(userId)) {
            const expirationTime = verificationCooldowns.get(userId) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({ content: `Please wait ${timeLeft.toFixed(1)} more second(s) before trying again.`, ephemeral: true });
            }
        }

        verificationCooldowns.set(userId, now);

        const { question, answer } = generateMathProblem();
        userQuestions.set(userId, { question, answer });

        const modal = new ModalBuilder()
            .setCustomId('verify_modal')
            .setTitle('Verification Math Test');

        const mathInput = new TextInputBuilder()
            .setCustomId('math_answer')
            .setLabel(`What is ${question}?`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the answer here...')
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(mathInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    },

    async handleModal(interaction) {
        if (interaction.customId !== 'verify_modal') return;

        const userId = interaction.user.id;
        const submittedAnswer = interaction.fields.getTextInputValue('math_answer').trim();
        const storedData = userQuestions.get(userId);

        if (!storedData) {
            return interaction.reply({ content: 'Session expired. Please click the button again.', ephemeral: true });
        }

        const { question, answer } = storedData;

        // Reset cooldown to now so they have to wait 10 seconds from THIS submission
        verificationCooldowns.set(userId, Date.now());

        if (submittedAnswer === answer) {
            const roleToAddId = '1483380118603960350';
            const roleToRemoveId = '1483509124678287491';
            
            try {
                const member = await interaction.guild.members.fetch(userId);
                
                // Add new role
                await member.roles.add(roleToAddId);
                
                // Remove old role if they have it
                if (member.roles.cache.has(roleToRemoveId)) {
                    await member.roles.remove(roleToRemoveId);
                }

                await interaction.reply({ content: 'Verification successful! You have been verified and roles have been updated.', ephemeral: true });
            } catch (error) {
                console.error('Error updating roles:', error);
                await interaction.reply({ content: 'Verification successful, but there was an error updating your roles. Please contact an administrator.', ephemeral: true });
            }
        } else {
            await interaction.reply({ content: `Wrong answer for **${question}**! You submitted ${submittedAnswer} but the correct answer was ${answer}. Please wait 10 seconds before trying again.`, ephemeral: true });
        }
        userQuestions.delete(userId);
    }
};
