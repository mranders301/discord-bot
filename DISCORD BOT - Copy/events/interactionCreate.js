client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
        }
    }

    // Handle button press for "Open Ticket"
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
        const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

        // Create dropdown menu
        const dropdown = new StringSelectMenuBuilder()
            .setCustomId('ticket_type')
            .setPlaceholder('Select the type of ticket')
            .addOptions([
                {
                    label: 'Support',
                    description: 'Get support from staff.',
                    value: 'support',
                },
                {
                    label: 'Order',
                    description: 'Inquire about an order.',
                    value: 'order',
                },
                {
                    label: 'Rewards',
                    description: 'Discuss rewards or loyalty points.',
                    value: 'rewards',
                },
            ]);

        const row = new ActionRowBuilder().addComponents(dropdown);

        await interaction.reply({
            content: 'Select the type of ticket you want to open:',
            components: [row],
            ephemeral: true,
        });
    }

    // Handle dropdown selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
        const guild = interaction.guild;
        const member = interaction.member;
        const ticketType = interaction.values[0]; // Get the selected value

        // Fetch the staff role
        const staffRoleObj = guild.roles.cache.find(role => role.name === staffRole);

        if (!staffRoleObj) {
            return interaction.reply({
                content: `The role "${staffRole}" does not exist. Please ask an administrator to create it.`,
                ephemeral: true,
            });
        }

        // Create a channel name based on ticket type
        const ticketChannelName = `ticket-${ticketType}-${member.user.username}`;

        // Create the ticket channel
        const ticketChannel = await guild.channels.create({
            name: ticketChannelName,
            type: 0, // Text channel
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: ['ViewChannel'],
                },
                {
                    id: member.id,
                    allow: ['ViewChannel', 'SendMessages'],
                },
                {
                    id: staffRoleObj.id,
                    allow: ['ViewChannel', 'SendMessages'],
                },
            ],
        });

        // Send welcome message in the ticket
        await ticketChannel.send({
            content: `<@&${staffRoleObj.id}>`,
            embeds: [
                {
                    title: `Ticket Created: ${ticketType}`,
                    description: `Welcome, ${member.user.username}! A staff member will assist you shortly.`,
                    thumbnail: { url: member.user.displayAvatarURL() },
                    color: 0x800080, // Purple color
                },
            ],
        });

        await interaction.reply({
            content: `Your ticket has been created: ${ticketChannel}`,
            ephemeral: true,
        });
    }
});
