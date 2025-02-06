/*
 Mac Command Center Server
 This server provides a centralized controller running on a Mac. It accepts natural language commands,
 translates them into system commands via a dummy translator, executes them remotely via SSH on a Raspberry Pi NAS,
 and streams real-time output to connected clients using Socket.io.
*/

// Load environment variables
require('dotenv').config();

// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client } = require('ssh2');
const fs = require('fs');
const config = require('./config');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { client: discordClient, handleCommandOutput } = require('./src/discord/bot');
const DeepSeekAI = require('./src/ai/deepseek');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Configure rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Command execution timeout (5 minutes)
const COMMAND_TIMEOUT = 5 * 60 * 1000;

// Track command execution times
const commandHistory = new Map();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Apply rate limiter to all routes
app.use(limiter);

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static('public'));

// Global variables to track the current SSH connection and stream
let currentSSHConn = null;
let currentSSHStream = null;

// Initialize DeepSeek AI
const ai = new DeepSeekAI(process.env.DEEPSEEK_API_KEY);

// Command mapping for different types of queries
const commandMap = {
    // System Status
    'status': 'uptime && free -h && df -h',
    'system status': 'uptime && free -h && df -h',
    'uptime': 'uptime',
    'monitor': 'top -b -n 1',

    // Memory Management
    'memory': 'free -h',
    'ram': 'free -h',
    'memory usage': 'free -h',

    // Process Management
    'processes': 'ps aux | head -n 10',
    'top processes': 'ps aux --sort=-%cpu | head -n 5',

    // Storage & RAID
    'disk space': 'df -h',
    'disk usage': 'df -h',
    'storage': 'df -h',
    'disk list': 'lsblk',
    'smart status': 'echo "=== SMART Status ===\n" && sudo smartctl -H /dev/sda && echo "\n=== SMART Attributes ===\n" && sudo smartctl -A /dev/sda',
    'raid': 'echo "=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md127',
    'raid status': 'echo "=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md127',
    'raid health': 'echo "=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md127',
    'how healthy is my raid array': 'echo "=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md127',

    // Temperature Monitoring
    'temperature': 'vcgencmd measure_temp',
    'temp': 'vcgencmd measure_temp',
    'cpu temp': 'vcgencmd measure_temp',
    'watch temps': 'vcgencmd measure_temp && echo "\n=== HDD Temperature ===" && sudo smartctl -A /dev/sda | grep Temperature',

    // Network Management
    'network': 'ip addr && ip route',
    'ip': 'hostname -I && ip addr',
    'network status': 'ip addr && ip route && iwconfig 2>/dev/null',
    'ports': 'sudo netstat -tuln',
    'connections': 'sudo netstat -tuln',
    'wifi': 'iwconfig 2>/dev/null || echo "No wireless interfaces found"',
    'wifi status': 'iwconfig 2>/dev/null && iwlist wlan0 scan 2>/dev/null || echo "No wireless interfaces found"',
    'tailscale': 'tailscale status',
    'tailscale status': 'tailscale status',
    'bluetooth': 'systemctl status bluetooth',
    'bluetooth status': 'systemctl status bluetooth && bluetoothctl devices',

    // File System Operations
    'ls': 'ls -la',
    'list': 'ls -la',
    'files': 'ls -la',
    'pwd': 'pwd',
    'current dir': 'pwd',

    // Docker Management
    'docker ps': 'docker ps -a',
    'docker containers': 'docker ps -a',
    'docker images': 'docker images',
    'docker status': 'docker info',
    'docker version': 'docker version',

    // Share Management
    'share status': 'echo "=== Samba Status ===\n" && systemctl status smbd && echo "\n=== Share List ===\n" && smbstatus && echo "\n=== Share Configuration ===\n" && cat /etc/samba/smb.conf | grep -v "^#\|^;\|^$"',
    'samba status': 'echo "=== Samba Status ===\n" && systemctl status smbd && echo "\n=== Share List ===\n" && smbstatus',
    'list shares': 'echo "=== Share List ===\n" && smbstatus && echo "\n=== Share Configuration ===\n" && cat /etc/samba/smb.conf | grep -v "^#\|^;\|^$"',
    'show shares': 'echo "=== Share List ===\n" && smbstatus && echo "\n=== Share Configuration ===\n" && cat /etc/samba/smb.conf | grep -v "^#\|^;\|^$"',
    'samba shares': 'echo "=== Share List ===\n" && smbstatus && echo "\n=== Share Configuration ===\n" && cat /etc/samba/smb.conf | grep -v "^#\|^;\|^$"',
    'share permissions': 'echo "=== Share Permissions ===\n" && smbstatus && echo "\n=== Share Configuration ===\n" && cat /etc/samba/smb.conf | grep -v "^#\|^;\|^$"',
    'share access': 'echo "=== Active Connections ===\n" && smbstatus && echo "\n=== Share Configuration ===\n" && cat /etc/samba/smb.conf | grep -v "^#\|^;\|^$"',

    // System Service Management
    'printers': 'lpstat -v',
    'printer status': 'lpstat -v',
    'cron list': 'crontab -l',
    'cron status': 'crontab -l',
    'time sync': 'timedatectl status',

    // Hardware Management
    'pi hardware': 'cat /proc/cpuinfo && echo "\n=== Memory Info ===\n" && cat /proc/meminfo | head -n 5 && echo "\n=== USB Devices ===\n" && lsusb',
    'eeprom status': 'vcgencmd bootloader_version && vcgencmd bootloader_config',

    // Combined Storage & RAID Queries
    'show storage and raid status': 'echo "=== Storage Usage ===\n" && df -h && echo "\n=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== SMART Status ===\n" && sudo smartctl -H /dev/sda',
    'disk usage and raid health': 'echo "=== Storage Usage ===\n" && df -h && echo "\n=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md127',
    'full storage report': 'echo "=== Storage Usage ===\n" && df -h && echo "\n=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md127 && echo "\n=== SMART Status ===\n" && sudo smartctl -H /dev/sda',
    
    // Combined System Status Queries
    'system overview': 'echo "=== System Load ===\n" && uptime && echo "\n=== Memory Usage ===\n" && free -h && echo "\n=== Storage Usage ===\n" && df -h && echo "\n=== Temperature ===\n" && vcgencmd measure_temp',
    'health check': 'echo "=== System Load ===\n" && uptime && echo "\n=== Memory Usage ===\n" && free -h && echo "\n=== Storage Usage ===\n" && df -h && echo "\n=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== SMART Status ===\n" && sudo smartctl -H /dev/sda',
};

// Enhanced translation function with better partial matching
async function translateCommand(naturalCommand) {
    try {
        const normalizedCommand = naturalCommand.toLowerCase().trim();
        
        // First check for exact matches
        if (commandMap[normalizedCommand]) {
            console.log('Using exact command mapping');
            return commandMap[normalizedCommand];
        }

        // Check for combined queries
        if (normalizedCommand.includes('and')) {
            const parts = normalizedCommand.split('and').map(part => part.trim());
            console.log('Detected combined query:', parts);
            
            // Look for matching compound commands first
            for (const [key, value] of Object.entries(commandMap)) {
                if (parts.every(part => key.includes(part))) {
                    console.log('Found matching compound command:', key);
                    return value;
                }
            }
            
            // If no compound command found, try to combine individual commands
            const commands = parts.map(part => {
                for (const [key, value] of Object.entries(commandMap)) {
                    if (key.includes(part)) return value;
                }
                return null;
            }).filter(cmd => cmd);
            
            if (commands.length > 0) {
                console.log('Combining individual commands');
                return commands.map((cmd, i) => 
                    `echo "=== ${parts[i].toUpperCase()} ===\n" && ${cmd}`
                ).join(' && echo "\n" && ');
            }
        }

        // Try to find a close match in the command map
        const words = normalizedCommand.split(' ');
        for (const [key, value] of Object.entries(commandMap)) {
            if (words.some(word => key.includes(word))) {
                console.log('Found partial command match:', key);
                return value;
            }
        }

        // If no match found, try AI translation
        try {
            const context = {
                input: naturalCommand,
                history: [], // We'll add history integration later
                systemState: {}
            };

            const aiResponse = await ai.translateCommand(context);
            
            if (aiResponse && aiResponse.confidence >= 0.8) {
                console.log('Using AI translation');
                return aiResponse.translation.command;
            }
        } catch (error) {
            console.error('AI translation failed:', error);
        }

        // If we get here, no valid translation was found
        console.log('No valid translation found, showing available commands');
        return `echo "Unknown command: '${naturalCommand}'\n\nAvailable commands:\n${Object.keys(commandMap).join('\n')}"`;
    } catch (error) {
        console.error('Translation error:', error);
        return `echo "Error processing command. Please try again."`;
    }
}

// GET /status endpoint: returns system status information
app.get('/status', async (req, res) => {
  const conn = new Client();
  
  try {
    await new Promise((resolve, reject) => {
      conn.on('ready', () => {
        // Commands to get system information
        const statusCommands = [
          'uptime',
          'free -h',
          'df -h',
          'vcgencmd measure_temp',
          'hostname -I'
        ];
        
        const status = {
          server: 'running',
          timestamp: new Date().toISOString(),
          system: {}
        };

        let completed = 0;
        
        statusCommands.forEach((cmd, index) => {
          conn.exec(cmd, (err, stream) => {
            if (err) {
              status.system[cmd] = { error: err.message };
              completed++;
            } else {
              let output = '';
              
              stream.on('data', (data) => {
                output += data;
              });
              
              stream.stderr.on('data', (data) => {
                output += data;
              });
              
              stream.on('close', () => {
                status.system[cmd] = output.trim();
                completed++;
                
                if (completed === statusCommands.length) {
                  conn.end();
                  res.json(status);
                }
              });
            }
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: config.ssh.host,
        port: 22,
        username: config.ssh.username,
        privateKey: fs.readFileSync(config.ssh.privateKey),
        debug: true
      });
    });
  } catch (err) {
    res.status(500).json({
      server: 'running',
      error: 'Could not connect to Raspberry Pi: ' + err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Set up Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected');
});

// POST /execute endpoint: accepts a JSON payload with a natural language command
app.post('/execute', async (req, res) => {
  const { command: naturalCommand, source, messageId } = req.body;
  if (!naturalCommand) {
    return res.status(400).json({ error: 'Command is required' });
  }

  // Translate the natural language command using AI
  const systemCommand = await translateCommand(naturalCommand);

  // Create a new SSH client
  const conn = new Client();
  currentSSHConn = conn;

  console.log('Attempting SSH connection to:', config.ssh.host);
  
  conn.on('ready', () => {
    console.log('SSH Connection established successfully');
    // Execute the translated system command on the Raspberry Pi NAS
    conn.exec(systemCommand, (err, stream) => {
      if (err) {
        console.error('Command execution error:', err);
        io.emit('commandFinished', { error: err.message, messageId });
        return res.status(500).json({ error: err.message });
      }

      console.log('Command stream created:', systemCommand);
      currentSSHStream = stream; // store current stream for potential interruption

      // Emit an event indicating the command has been issued
      io.emit('commandIssued', { command: naturalCommand, systemCommand, messageId });

      // Handle stream events
      stream.on('close', (code, signal) => {
        console.log('Command stream closed:', { code, signal });
        io.emit('commandFinished', { code, signal, messageId });

        // If command was successful, analyze the output
        if (code === 0) {
          // Get the accumulated output from the stream events
          const commandOutput = stream.stdoutData || '';  // We'll need to capture this

          // Analyze the results
          ai.analyzeResult(naturalCommand, systemCommand, commandOutput)
            .then(analysis => {
              console.log('Command analysis:', analysis);
              io.emit('commandAnalysis', { 
                analysis: analysis.analysis,
                messageId 
              });
            })
            .catch(error => {
              console.error('Analysis failed:', error);
              io.emit('commandAnalysis', { 
                error: 'Failed to analyze command output',
                messageId 
              });
            });
        }

        currentSSHConn = null;
        currentSSHStream = null;
        conn.end();
      }).on('data', (data) => {
        const output = data.toString();
        console.log('Command output:', output);
        // Store the output for analysis
        stream.stdoutData = (stream.stdoutData || '') + output;
        // Emit stdout data to connected clients
        io.emit('commandOutput', { type: 'stdout', data: output, messageId });
      });

      // Capture stderr data and emit to clients
      stream.stderr.on('data', (data) => {
        console.error('Command error output:', data.toString());
        io.emit('commandOutput', { type: 'stderr', data: data.toString(), messageId });
      });

      // Respond to the client that the command execution has begun
      res.json({ status: 'Command execution started' });
    });
  }).on('error', (err) => {
    // Handle SSH connection errors
    console.error('SSH Error:', err);
    res.status(500).json({ error: 'SSH connection error: ' + err.message });
  }).connect({
    host: config.ssh.host,
    port: 22,
    username: config.ssh.username,
    privateKey: fs.readFileSync(config.ssh.privateKey),
    debug: true,
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp521',
        'diffie-hellman-group-exchange-sha256'
      ],
      cipher: [
        'aes128-ctr',
        'aes192-ctr',
        'aes256-ctr',
        'aes128-gcm@openssh.com',
        'aes256-gcm@openssh.com'
      ],
      serverHostKey: [
        'ssh-rsa',
        'ecdsa-sha2-nistp256',
        'ssh-ed25519'
      ],
      hmac: [
        'hmac-sha2-256',
        'hmac-sha2-512'
      ]
    }
  });
});

// POST /stop endpoint: interrupts a running command by sending a signal via the SSH connection
app.post('/stop', (req, res) => {
  if (currentSSHStream) {
    // Send an interrupt signal (SIGINT) to the remote process
    currentSSHStream.signal('SIGINT');
    // Close the SSH connection
    currentSSHConn.end();
    currentSSHConn = null;
    currentSSHStream = null;
    io.emit('commandStopped', { message: 'Command interrupted and SSH connection closed' });
    return res.json({ status: 'Command stop signal sent' });
  } else {
    return res.status(400).json({ error: 'No running command to stop' });
  }
});

// Initialize Discord bot if token is provided
if (config.discord && config.discord.token) {
  discordClient.login(config.discord.token)
    .then(() => console.log('Discord bot connected'))
    .catch(err => console.error('Discord bot connection error:', err));
} else {
  console.log('No Discord token provided, bot integration disabled');
}

// Start the server on the configured port
server.listen(config.port, async () => {
  console.log(`Server is running on port ${config.port}`);
  
  // Initialize AI system
  try {
    await ai.initialize();
    console.log('AI system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AI system:', error);
    console.log('Server will fall back to static command mapping');
  }
}); 