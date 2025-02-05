# Nasty AI Command Center

A centralized command center for managing a Raspberry Pi NAS system using natural language commands. The system provides a web interface and translates natural language inputs into system commands, executing them remotely via SSH.

## Features

- Natural language command processing
- Real-time command output streaming
- System monitoring and status checks
- Docker container management
- Network and storage management
- Hardware monitoring
- Power management with safety checks
- Service status monitoring

## Commands

See [docs/commands.md](docs/commands.md) for a complete list of available commands.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure SSH settings in `config.js`:
```javascript
module.exports = {
  port: 3000,
  ssh: {
    host: 'your-raspberry-pi-hostname',
    username: 'pi',
    privateKey: '/path/to/your/private/key'
  }
};
```

3. Start the server:
```bash
npm start
```

## Security Notes

- All commands are executed via SSH using key-based authentication
- Sensitive configurations should be stored in environment variables
- Power management commands include safety checks and confirmations
- Service commands are read-only by default

## License

MIT 