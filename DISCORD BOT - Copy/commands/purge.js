const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Purges a specified number of messages from the channel.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('The number of messages to purge (1-100).')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Only users with ManageMessages permission can use this command

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        // Validate amount
        if (amount < 1 || amount > 100) {
            return interaction.reply({
                content: 'Please provide a valid number of messages to purge (1-100).',
                ephemeral: true,
            });
        }

        // Fetch messages and delete
        try {
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            await interaction.channel.bulkDelete(messages, true); // 'true' to filter out non-quotable messages like bot messages
            await interaction.reply({
                content: `Successfully deleted ${amount} messages.`,
                ephemeral: true,
            });
        } catch (error) {
            console.error('Error purging messages:', error);
            await interaction.reply({
                content: 'There was an error trying to purge messages.',
                ephemeral: true,
            });
        }
    },
};
