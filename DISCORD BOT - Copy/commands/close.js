const { SlashCommandBuilder } = require('discord.js');
const { logsChannelId } = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Closes the current ticket.'),
    async execute(interaction) {
        const ticketChannel = interaction.channel;
        const member = interaction.member;

        // Ensure the command is used in a ticket channel
        if (!ticketChannel.name.startsWith('ticket-')) {
            return interaction.reply({
                content: 'This command can only be used in a ticket channel.',
                ephemeral: true,
            });
        }

        // Ensure the user has the right permissions
        if (!ticketChannel.permissionsFor(member).has('MANAGE_CHANNELS')) {
            return interaction.reply({
                content: 'You do not have permission to close this ticket.',
                ephemeral: true,
            });
        }

        // Close the ticket by removing permissions and logging it
        await ticketChannel.setParent(null, { lockPermissions: true });

        // Send a confirmation reply
        await interaction.reply({
            content: `The ticket has been closed: ${ticketChannel.name}`,
            ephemeral: true,
        });

        // Log the closing of the ticket
        const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
        if (logsChannel) {
            await logsChannel.send({
                content: `Ticket closed by ${member.user.tag} in ${ticketChannel}.`,
            });
        }

        // Optionally delete the ticket after a delay or move it to an archive category
        setTimeout(() => {
            ticketChannel.delete();
        }, 5000); // 5 seconds delay before deletion
    },
};
