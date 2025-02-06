const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');
const config = require('../../config');
const io = require('socket.io-client');

// Create Socket.io client connection
const socket = io(`http://localhost:${config.port}`);

// Create a new Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
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

// Socket connection handlers
socket.on('connect', () => {
    console.log('Socket.io connected to server');
});

socket.on('disconnect', () => {
    console.log('Socket.io disconnected from server');
});

socket.on('error', (error) => {
    console.error('Socket.io error:', error);
});

// Command event handlers
socket.on('commandIssued', async (data) => {
    console.log('Command issued event:', data);
    if (!data.messageId || !activeCommands.has(data.messageId)) {
        console.log('No active command found for messageId:', data.messageId);
        return;
    }
    
    const command = activeCommands.get(data.messageId);
    command.output = [`Executing: ${data.systemCommand}`];  // Reset output array
    await updateCommandMessage(data.messageId);
});

socket.on('commandOutput', async (data) => {
    console.log('Command output event:', data);
    if (!data.messageId || !activeCommands.has(data.messageId)) {
        console.log('No active command found for messageId:', data.messageId);
        return;
    }
    
    const command = activeCommands.get(data.messageId);
    command.output.push(data.data.trim());  // Trim whitespace
    await updateCommandMessage(data.messageId);
});

socket.on('commandFinished', async (data) => {
    console.log('Command finished event:', data);
    if (!data.messageId || !activeCommands.has(data.messageId)) {
        console.log('No active command found for messageId:', data.messageId);
        return;
    }
    
    const command = activeCommands.get(data.messageId);
    command.status = 'completed';
    if (data.error) {
        command.output.push(`Error: ${data.error}`);
        await updateCommandMessage(data.messageId);
        activeCommands.delete(data.messageId);
    }
    // Update command output message with completion status
    await updateCommandMessage(data.messageId);
});

socket.on('commandAnalysis', async (data) => {
    console.log('Command analysis event:', data);
    if (!data.messageId || !activeCommands.has(data.messageId)) {
        console.log('No active command found for messageId:', data.messageId);
        return;
    }

    const command = activeCommands.get(data.messageId);
    
    try {
        if (data.error) {
            await command.message.channel.send('❌ Analysis Error: ' + data.error);
        } else {
            const analysis = data.analysis;
            let analysisMessage = `${analysis.summary}\n`;
            
            // Add concerns if any
            if (analysis.concerns && analysis.concerns.length > 0) {
                analysisMessage += '\n⚠️ **Concerns:**';
                analysis.concerns.forEach(concern => {
                    analysisMessage += `\n• ${concern}`;
                });
            }
            
            // Add recommendations if any
            if (analysis.recommendations && analysis.recommendations.length > 0) {
                analysisMessage += '\n\n💡 **Recommendations:**';
                analysis.recommendations.forEach(rec => {
                    analysisMessage += `\n• ${rec}`;
                });
            }
            
            // Add details if present
            if (analysis.details) {
                analysisMessage += `\n\n${analysis.details}`;
            }
            
            await command.message.channel.send(analysisMessage);
        }
    } catch (error) {
        console.error('Error sending analysis message:', error);
    }
    
    activeCommands.delete(data.messageId);
});

// Handle messages
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const commandContent = message.content.slice(PREFIX.length).trim();
    if (!commandContent) return;

    try {
        // Send initial response
        const response = await message.channel.send('⏳ Processing command...');
        
        // Track command status
        activeCommands.set(message.id, {
            message: response,
            output: ['Initializing...'],
            status: 'processing'
        });

        // Send command to server
        await axios.post(`http://localhost:${config.port}/execute`, {
            command: commandContent,
            source: 'discord',
            messageId: message.id
        });

    } catch (error) {
        console.error('Error executing command:', error);
        if (activeCommands.has(message.id)) {
            const command = activeCommands.get(message.id);
            command.status = 'error';
            command.output = [`Error: ${error.message}`];
            await updateCommandMessage(message.id);
            activeCommands.delete(message.id);
        }
    }
});

// Handle command output updates via Socket.io
function handleCommandOutput(socket) {
    // Remove this function as we're now handling events directly
}

// Update Discord message with command output
async function updateCommandMessage(messageId) {
    console.log('Updating message for ID:', messageId);
    const command = activeCommands.get(messageId);
    if (!command) {
        console.log('No command found for update');
        return;
    }

    try {
        // Format output with code blocks and status
        const status = command.status === 'processing' ? '🔄' : '✅';
        
        // Join all output lines, but limit total length to avoid Discord's message limit
        let output = command.output.join('\n');
        if (output.length > 1900) {
            output = output.slice(-1900) + '\n... (output truncated)';
        }

        const content = `${status} Command Output:\n\`\`\`\n${output}\n\`\`\``;
        await command.message.edit(content);
    } catch (error) {
        console.error('Error updating Discord message:', error);
    }
}

// Export bot functionality
module.exports = {
    client,
    // Remove handleCommandOutput as it's no longer needed
}; 