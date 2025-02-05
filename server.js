/*
 Mac Command Center Server
 This server provides a centralized controller running on a Mac. It accepts natural language commands,
 translates them into system commands via a dummy translator, executes them remotely via SSH on a Raspberry Pi NAS,
 and streams real-time output to connected clients using Socket.io.
*/

// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client } = require('ssh2');
const fs = require('fs');
const config = require('./config');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

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

/*
 Dummy translator function
 Maps natural language commands to system commands.
 This will be replaced later with DeepSeek API integration.
*/
const commandMap = {
    // System status commands
    'status': 'uptime && free -h && df -h',
    'system status': 'uptime && free -h && df -h',
    'uptime': 'uptime',
    
    // Disk and storage commands
    'disk space': 'df -h',
    'disk usage': 'df -h',
    'storage': 'df -h',
    'disk list': 'lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE || echo "lsblk not available"',
    'smart status': 'sudo smartctl -H /dev/sda || echo "SMART not available for /dev/sda"',
    
    // Memory commands
    'memory': 'free -h',
    'ram': 'free -h',
    'memory usage': 'free -h',
    
    // Temperature and hardware
    'temperature': 'vcgencmd measure_temp',
    'temp': 'vcgencmd measure_temp',
    'cpu temp': 'vcgencmd measure_temp',
    'watch temps': 'vcgencmd measure_temp && echo "\nDisk Temperature:" && sudo smartctl -A /dev/sda | grep Temperature_Celsius || echo "No disk temperature available"',
    
    // Process commands
    'processes': 'ps aux | head -n 10',
    'top processes': 'ps aux --sort=-%cpu | head -n 5',
    
    // Network commands
    'network': 'ip -br addr && echo "\nRouting:" && ip -br route',
    'ip': 'hostname -I && echo "\nDetailed IP info:" && ip -br addr',
    'network status': 'echo "=== Network Interfaces ===\n" && ip -br addr && echo "\n=== Routing Table ===\n" && ip -br route',
    'ports': 'ss -tuln',
    'connections': 'ss -tuln',

    // Basic file system commands
    'ls': 'ls -lah',
    'list': 'ls -lah',
    'files': 'ls -lah',
    'pwd': 'pwd',
    'current dir': 'pwd',
    
    // Docker commands (with error handling)
    'docker ps': 'docker ps -a || echo "Error: Cannot list Docker containers"',
    'docker containers': 'docker ps -a || echo "Error: Cannot list Docker containers"',
    'docker images': 'docker images || echo "Error: Cannot list Docker images"',
    'docker status': 'docker info || echo "Error: Cannot get Docker status"',
    'docker version': 'docker version || echo "Error: Cannot get Docker version"',

    // Enhanced monitoring
    'monitor': 'echo "=== System Load ===\n" && uptime && \
               echo "\n=== Memory Usage ===\n" && free -h && \
               echo "\n=== Storage Usage ===\n" && df -h && \
               echo "\n=== Temperature ===\n" && vcgencmd measure_temp && \
               echo "\n=== Top Processes ===\n" && ps aux --sort=-%cpu | head -n 5',

    // Share status (with error handling)
    'share status': 'echo "=== Samba Status ===\n" && sudo systemctl status smbd || echo "Samba not running" && \
                    echo "\n=== NFS Status ===\n" && sudo systemctl status nfs-kernel-server || echo "NFS not running"',
    
    // System Power Commands with Status Checking
    'shutdown': 'echo "=== System Status Check ===\n" && \
                echo "\nActive Users:" && who && \
                echo "\nSystem Load:" && uptime && \
                echo "\nActive Docker Containers:" && docker ps --format "table {{.Names}}\t{{.Status}}" && \
                echo "\nWARNING: This will shutdown the system. Type \'shutdown confirm\' to proceed."',
    
    'shutdown confirm': 'echo "=== Final System Check ===\n" && \
                        echo "Active Users:" && who && \
                        echo "\nRunning Processes:" && ps aux --sort=-%cpu | head -n 5 && \
                        echo "\nActive Docker Containers:" && docker ps --format "table {{.Names}}\t{{.Status}}" && \
                        echo "\nProceeding with shutdown in 1 minute..." && \
                        sudo shutdown -h +1',
    
    'reboot': 'echo "=== System Status Check ===\n" && \
              echo "\nActive Users:" && who && \
              echo "\nSystem Load:" && uptime && \
              echo "\nActive Docker Containers:" && docker ps --format "table {{.Names}}\t{{.Status}}" && \
              echo "\nWARNING: This will reboot the system. Type \'reboot confirm\' to proceed."',
    
    'reboot confirm': 'echo "=== Final System Check ===\n" && \
                      echo "Active Users:" && who && \
                      echo "\nRunning Processes:" && ps aux --sort=-%cpu | head -n 5 && \
                      echo "\nActive Docker Containers:" && docker ps --format "table {{.Names}}\t{{.Status}}" && \
                      echo "\nProceeding with reboot in 1 minute..." && \
                      sudo shutdown -r +1',
    
    'shutdown cancel': 'sudo shutdown -c && echo "Shutdown/reboot cancelled."',
    
    'shutdown status': 'echo "=== Current System Status ===\n" && \
                       echo "Active Users:" && who && \
                       echo "\nSystem Load:" && uptime && \
                       echo "\nActive Docker Containers:" && docker ps --format "table {{.Names}}\t{{.Status}}" && \
                       echo "\nTop Processes:" && ps aux --sort=-%cpu | head -n 5',

    // Network Service Commands
    'tailscale': 'echo "=== Tailscale Status ===\n" && sudo tailscale status',
    'tailscale status': 'echo "=== Tailscale Status ===\n" && sudo tailscale status',
    'wifi': 'echo "=== WiFi Status ===\n" && iwconfig wlan0 && echo "\n=== Connection Details ===\n" && nmcli device wifi list',
    'wifi status': 'echo "=== WiFi Status ===\n" && iwconfig wlan0 && echo "\n=== Connection Details ===\n" && nmcli connection show --active',
    'bluetooth': 'echo "=== Bluetooth Status ===\n" && sudo systemctl status bluetooth && echo "\n=== Paired Devices ===\n" && bluetoothctl paired-devices',
    'bluetooth status': 'echo "=== Bluetooth Status ===\n" && sudo systemctl status bluetooth && echo "\n=== Paired Devices ===\n" && bluetoothctl paired-devices',

    // Storage Service Commands
    'raid': 'echo "=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md0 2>/dev/null || echo "No RAID array found"',
    'raid status': 'echo "=== RAID Status ===\n" && cat /proc/mdstat && echo "\n=== Array Details ===\n" && sudo mdadm --detail /dev/md0 2>/dev/null || echo "No RAID array found"',
    'smart monitor': 'echo "=== SMART Status ===\n" && sudo smartctl -H /dev/sda && echo "\n=== SMART Attributes ===\n" && sudo smartctl -A /dev/sda',
    'disk events': 'echo "=== Recent Disk Events ===\n" && sudo journalctl -u udisks2 -n 20',

    // System Service Commands
    'printers': 'echo "=== Printer Status ===\n" && lpstat -p -d && echo "\n=== Print Queue ===\n" && lpq',
    'printer status': 'echo "=== Printer Status ===\n" && lpstat -p -d && echo "\n=== Print Queue ===\n" && lpq',
    'cron list': 'echo "=== System Cron Jobs ===\n" && sudo cat /etc/crontab && echo "\n=== User Cron Jobs ===\n" && crontab -l',
    'cron status': 'echo "=== System Cron Jobs ===\n" && sudo cat /etc/crontab && echo "\n=== User Cron Jobs ===\n" && crontab -l',
    'time sync': 'echo "=== Time Sync Status ===\n" && timedatectl && echo "\n=== NTP Status ===\n" && sudo systemctl status systemd-timesyncd',

    // Hardware Commands
    'pi hardware': 'echo "=== Hardware Info ===\n" && cat /proc/cpuinfo && echo "\n=== Memory Info ===\n" && cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable" && echo "\n=== USB Devices ===\n" && lsusb',
    'eeprom status': 'echo "=== Firmware Status ===\n" && sudo rpi-eeprom-update',

    // Help command (updated with new categories)
    'help': 'echo "Available commands:\n\
    - System: status, uptime, monitor\n\
    - Storage: disk space, disk list, smart status, raid status\n\
    - Memory: ram, memory\n\
    - Temperature: temp, watch temps\n\
    - Network: ip, network, ports, wifi status, tailscale status\n\
    - Docker: docker ps, docker images, docker status\n\
    - Files: ls, pwd\n\
    - Shares: share status\n\
    - Power: shutdown, reboot (add \'confirm\' to execute, \'cancel\' to stop)\n\
    - Hardware: pi hardware, eeprom status\n\
    - Services: printers, cron list, time sync, bluetooth status\n\n\
    Type any command for more details"'
};

// Enhanced translation function with better error handling
function translateCommand(naturalCommand) {
    // Convert to lowercase for matching but keep original for execution
    const cmdLower = naturalCommand.toLowerCase().trim();
    
    // First, check for exact matches in commandMap
    if (commandMap[cmdLower]) {
        console.log('Found exact match in commandMap:', cmdLower);
        return commandMap[cmdLower];
    }
    
    // Handle Docker commands specially
    if (cmdLower.startsWith('docker ')) {
        console.log('Found Docker command:', naturalCommand);
        return naturalCommand;
    }
    
    // List of basic commands that should be passed through without translation
    const basicCommands = [
        'ls', 'pwd', 'df', 'free', 'ip', 'ss',
        'smartctl', 'lsblk', 'systemctl'
    ];
    
    // Check if the command starts with any basic command
    for (const basicCmd of basicCommands) {
        if (cmdLower.startsWith(basicCmd)) {
            console.log('Found basic command:', basicCmd);
            return naturalCommand;
        }
    }
    
    // Special handling for common command variations
    if (cmdLower === 'df') return 'df -h';
    if (cmdLower === 'free') return 'free -h';
    if (cmdLower === 'ls') return 'ls -lah';
    if (cmdLower === 'ip') return 'ip -br addr';
    
    // If no match found, return help message
    return `echo "Unknown command: '${naturalCommand}'\n\nAvailable commands:\n` +
           `- System: status, uptime, monitor\n` +
           `- Storage: disk space, disk list, smart status\n` +
           `- Memory: ram, memory\n` +
           `- Temperature: temp, watch temps\n` +
           `- Network: ip, network, ports\n` +
           `- Docker: docker ps, docker images, docker status\n` +
           `- Files: ls, pwd\n` +
           `- Shares: share status\n\n` +
           `Type 'help' for more details"`;
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

// POST /execute endpoint: accepts a JSON payload with a natural language command
app.post('/execute', (req, res) => {
  const { command: naturalCommand } = req.body;
  if (!naturalCommand) {
    return res.status(400).json({ error: 'Command is required' });
  }

  // Translate the natural language command using the dummy translator
  const systemCommand = translateCommand(naturalCommand);

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
        io.emit('commandFinished', { error: err.message });
        return res.status(500).json({ error: err.message });
      }

      console.log('Command stream created:', systemCommand);
      currentSSHStream = stream; // store current stream for potential interruption

      // Emit an event indicating the command has been issued
      io.emit('commandIssued', { command: naturalCommand, systemCommand });

      // Handle stream events
      stream.on('close', (code, signal) => {
        console.log('Command stream closed:', { code, signal });
        io.emit('commandFinished', { code, signal });
        currentSSHConn = null;
        currentSSHStream = null;
        conn.end();
      }).on('data', (data) => {
        console.log('Command output:', data.toString());
        // Emit stdout data to connected clients
        io.emit('commandOutput', { type: 'stdout', data: data.toString() });
      });

      // Capture stderr data and emit to clients
      stream.stderr.on('data', (data) => {
        console.error('Command error output:', data.toString());
        io.emit('commandOutput', { type: 'stderr', data: data.toString() });
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

// Start the server on the configured port
server.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
}); 