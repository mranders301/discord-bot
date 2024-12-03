const { Client, GatewayIntentBits, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, staffRole, logsChannelId, ticketChannelTimeout, cooldownTime } = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
}

// Cooldown tracking
const cooldowns = new Map();

// Event handlers
client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

// Ticket creation and interaction handler
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

    // Handle "Open Ticket" button press
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
        // Check if the user is on cooldown
        const userId = interaction.user.id;
        if (cooldowns.has(userId) && cooldowns.get(userId) > Date.now()) {
            const timeLeft = (cooldowns.get(userId) - Date.now()) / 1000;
            return interaction.reply({
                content: `You must wait ${timeLeft.toFixed(1)} more seconds before opening another ticket.`,
                ephemeral: true
            });
        }

        // Set cooldown for ticket creation
        cooldowns.set(userId, Date.now() + cooldownTime);

        // Create dropdown menu for ticket types
        const dropdown = new StringSelectMenuBuilder()
            .setCustomId('ticket_type')
            .setPlaceholder('Select the type of ticket')
            .addOptions([
                { label: 'Support', description: 'Get support from staff.', value: 'support' },
                { label: 'Order', description: 'Purchase an item.', value: 'order' },
                { label: 'Rewards', description: 'Claim rewards.', value: 'rewards' },
            ]);

        const row = new ActionRowBuilder().addComponents(dropdown);

        await interaction.reply({
            content: 'Please select the type of ticket you want to open:',
            components: [row],
            ephemeral: true,
        });
    }

    // Handle dropdown selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
        const guild = interaction.guild;
        const member = interaction.member;
        const ticketType = interaction.values[0]; // Get the selected value

        // Create channel name based on ticket type
        const ticketChannelName = `ticket-${ticketType}-${member.user.username}`;

        // Check if the category exists, if not, create it
        let category = guild.channels.cache.find(c => c.name === `${ticketType}s` && c.type === 4);
        if (!category) {
            category = await guild.channels.create({
                name: `${ticketType}s`,
                type: 4, // Category
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: ['ViewChannel'],
                    },
                ],
            });
        }

        // Create the ticket channel
        const ticketChannel = await guild.channels.create({
            name: ticketChannelName,
            type: 0, // Text channel
            parent: category.id,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
                { id: member.id, allow: ['ViewChannel', 'SendMessages'] },
                { id: guild.roles.cache.find(role => role.name === staffRole).id, allow: ['ViewChannel', 'SendMessages'] },
            ],
        });

        // Create the "Close Ticket" button
        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(closeButton);

        // Create the embed message
        const embed = new EmbedBuilder()
            .setColor(0x800080) // Purple color
            .setTitle('Ticket Created')
            .setDescription(`Hello <@${member.id}>! A staff member will assist you shortly. If you're done, you can close this ticket using the button below.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 })) // User's avatar as thumbnail
            .setFooter({ text: 'Ticket created at', iconURL: member.user.displayAvatarURL({ dynamic: true, size: 128 }) });

        // Send the embed and button to the ticket channel
        await ticketChannel.send({
            embeds: [embed],
            components: [row],
        });

        // Log ticket creation in the logs channel
        const logsChannel = guild.channels.cache.get(logsChannelId);
        if (logsChannel) {
            await logsChannel.send({
                content: `New ticket created by <@${member.id}> (${ticketType}) in ${ticketChannel}.`,
            });
        }

        await interaction.reply({
            content: `Your ticket has been created: ${ticketChannel}`,
            ephemeral: true,
        });
    }

    // Handle "Close Ticket" button press
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const ticketChannel = interaction.channel;
        const member = interaction.member;

        // Ensure the ticket channel exists and hasn't been deleted
        if (!ticketChannel || ticketChannel.deleted || !ticketChannel.name.startsWith('ticket-')) {
            return interaction.reply({
                content: 'The ticket channel no longer exists or has been deleted.',
                ephemeral: true,
            });
        }

        // Ensure the user is authorized to close the ticket
        if (!ticketChannel.permissionsFor(member).has('MANAGE_CHANNELS')) {
            return interaction.reply({
                content: 'You are not authorized to close this ticket.',
                ephemeral: true,
            });
        }

        // Collect all messages in the ticket channel and create a transcript
        const messages = await ticketChannel.messages.fetch({ limit: 100 });
        let transcript = messages.map(msg => `[${msg.author.tag}] ${msg.content}`).join('\n');

        // Save the transcript to a text file
        const transcriptFilePath = `./transcripts/${ticketChannel.id}-transcript.txt`;
        fs.writeFileSync(transcriptFilePath, transcript);

        // Log the closure in the logs channel
        const logsChannel = client.channels.cache.get(logsChannelId);
        if (logsChannel) {
            await logsChannel.send({
                content: `Ticket closed by ${member.user.tag} in ${ticketChannel}. Here's the transcript:`,
                files: [transcriptFilePath],
            });
        } else {
            console.error('Logs channel not found or invalid.');
        }

        // Send the reply to the user
        await interaction.reply({
            content: `The ticket has been closed: ${ticketChannel.name}`,
            ephemeral: true,
        });

        // Log the closure in the ticket channel and delete the ticket channel
        try {
            console.log(`Attempting to delete ticket channel: ${ticketChannel.name}`);
            await ticketChannel.delete();
            console.log(`Ticket channel ${ticketChannel.name} deleted successfully.`);
        } catch (error) {
            console.error(`Failed to delete ticket channel: ${ticketChannel.name}`, error);
            // You could notify admins here if deletion fails
        }
    }
});

// `/close` command to close a ticket via chat
client.on('messageCreate', async message => {
    if (message.content === '/close' && message.channel.name.startsWith('ticket-')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('You do not have permission to close this ticket.');
        }

        const ticketChannel = message.channel;

        // Collect all messages in the ticket channel and create a transcript
        const messages = await ticketChannel.messages.fetch({ limit: 100 });
        let transcript = messages.map(msg => `[${msg.author.tag}] ${msg.content}`).join('\n');

        // Save the transcript to a text file
        const transcriptFilePath = `./transcripts/${ticketChannel.id}-transcript.txt`;
        fs.writeFileSync(transcriptFilePath, transcript);

        // Send the transcript as a file to the logs channel
        const logsChannel = message.guild.channels.cache.get(logsChannelId);
        if (logsChannel) {
            await logsChannel.send({
                content: `Ticket closed by ${message.author.tag} in ${ticketChannel}. Here's the transcript:`,
                files: [transcriptFilePath],
            });
        }

        // Log the closing of the ticket in the logs channel
        await logsChannel.send({
            content: `Ticket closed by ${message.author.tag} in ${ticketChannel}.`,
        });

        await message.reply(`The ticket has been closed: ${ticketChannel.name}`);

        // Optionally delete the ticket after a short delay
        setTimeout(async () => {
            try {
                console.log(`Attempting to delete ticket channel: ${ticketChannel.name}`);
                await ticketChannel.delete();
                console.log(`Ticket channel ${ticketChannel.name} deleted successfully.`);
            } catch (error) {
                console.error(`Failed to delete ticket channel nigga: ${ticketChannel.name}`, error);
            }
        }, ticketChannelTimeout);
    }
});

client.login(token);
