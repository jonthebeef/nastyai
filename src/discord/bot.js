const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

// Create a new Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Command prefix
const PREFIX = '!';

// Track command execution status
const activeCommands = new Map();

// Connect to Discord
client.once(Events.ClientReady, () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
});

// Handle messages
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots or without prefix
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    // Extract command content
    const commandContent = message.content.slice(PREFIX.length).trim();
    if (!commandContent) return;

    try {
        // Send initial response
        const response = await message.reply(`Processing command: \`${commandContent}\``);

        // Track command status
        activeCommands.set(message.id, {
            message: response,
            output: [],
            status: 'processing'
        });

        // Send command to server
        const serverResponse = await axios.post(`http://localhost:${config.port}/execute`, {
            command: commandContent,
            source: 'discord',
            messageId: message.id
        });

        // Update response with command acceptance
        await response.edit(`Command accepted: \`${commandContent}\`\nExecuting...`);

    } catch (error) {
        console.error('Error executing command:', error);
        await message.reply(`Error executing command: ${error.message}`);
    }
});

// Handle command output updates via Socket.io
function handleCommandOutput(socket) {
    socket.on('commandIssued', async (data) => {
        if (!data.messageId || !activeCommands.has(data.messageId)) return;
        
        const command = activeCommands.get(data.messageId);
        command.output.push(`Executing: ${data.systemCommand}`);
        await updateCommandMessage(data.messageId);
    });

    socket.on('commandOutput', async (data) => {
        if (!data.messageId || !activeCommands.has(data.messageId)) return;
        
        const command = activeCommands.get(data.messageId);
        command.output.push(data.data);
        await updateCommandMessage(data.messageId);
    });

    socket.on('commandFinished', async (data) => {
        if (!data.messageId || !activeCommands.has(data.messageId)) return;
        
        const command = activeCommands.get(data.messageId);
        command.status = 'completed';
        command.output.push('Command completed.');
        await updateCommandMessage(data.messageId);
        activeCommands.delete(data.messageId);
    });

    socket.on('commandStopped', async (data) => {
        if (!data.messageId || !activeCommands.has(data.messageId)) return;
        
        const command = activeCommands.get(data.messageId);
        command.status = 'stopped';
        command.output.push('Command stopped.');
        await updateCommandMessage(data.messageId);
        activeCommands.delete(data.messageId);
    });
}

// Update Discord message with command output
async function updateCommandMessage(messageId) {
    const command = activeCommands.get(messageId);
    if (!command) return;

    try {
        // Format output with code blocks and status
        const status = command.status === 'processing' ? '🔄' : 
                      command.status === 'completed' ? '✅' : '⚠️';
        
        const output = command.output
            .slice(-15) // Keep last 15 lines to avoid Discord message limit
            .join('\n');

        const content = `${status} Command Output:\n\`\`\`\n${output}\n\`\`\``;
        await command.message.edit(content);
    } catch (error) {
        console.error('Error updating Discord message:', error);
    }
}

// Export bot functionality
module.exports = {
    client,
    handleCommandOutput
}; 