# Nasty AI Command Center Architecture

## Component Overview

### Backend Server
- **Language**: JavaScript (Node.js)
- **Framework**: Express.js for REST API endpoints and serving static files
- **Real-Time Communication**: Socket.io for pushing live command output and status updates
- **SSH Communication**: ssh2 package for Raspberry Pi connection
- **HTTP Client**: Axios for external APIs and inter-module communication
- **Configuration**: Environment variables and config.js for settings

### Discord Integration
- **Library**: discord.js for bot functionality
- **Communication**: HTTP POST requests to Express server's /execute endpoint
- **Feedback**: Real-time command status updates to Discord channels

### Web Interface (Dashboard)
- **Frontend**: Plain HTML/JavaScript (with optional React/Next.js upgrade path)
- **Real-Time Updates**: Socket.io client for live terminal output
- **UI Components**:
  - Chat Panel for command input
  - Terminal Panel for real-time output
  - Control elements (Send/Stop Command buttons)

### Infrastructure & Deployment
- **Primary Host**: Mac machine (command center)
  - Hosts Node.js server
  - Runs Socket.io service
  - Manages Discord bot
- **Remote Host**: Raspberry Pi NAS
  - Accessible over LAN via SSH
  - Executes system commands
- **Security**:
  - SSH key-based authentication
  - Environment variables for credentials
  - Optional JWT/API key protection

## Detailed Architecture

### 1. Command Center (Mac)
#### Core Server
- Node.js application with Express
- REST Endpoints:
  - `GET /status`: Server health check
  - `POST /execute`: Command execution
  - `POST /stop`: Command interruption
- Command translation system (DeepSeek API integration ready)
- SSH connection management via ssh2
- Real-time event broadcasting:
  - `commandOutput`
  - `commandFinished`
  - `commandStopped`

### 2. Remote Execution (Raspberry Pi)
- Lightweight target system
- No additional software requirements
- Command execution via SSH
- Real-time output streaming
- System command access:
  - Diagnostics
  - Docker management
  - RAID monitoring
  - Service control

### 3. Discord Integration
- discord.js bot implementation
- Command prefix monitoring (e.g., "!")
- HTTP communication with command center
- Status updates and command feedback
- Error handling and user notifications

### 4. Web Dashboard
#### Interface Components
- Socket.io client connection
- Split-panel design:
  - Command input (Chat Panel)
  - Output display (Terminal Panel)
- Command control features:
  - Execution
  - Interruption
  - Status monitoring

### 5. Communication Flow
1. **Command Input**
   - Web interface or Discord
   - Natural language processing
   - Command validation

2. **Command Processing**
   - Translation to system commands
   - SSH connection establishment
   - Remote execution

3. **Output Handling**
   - Real-time streaming
   - Status updates
   - Error management

4. **Command Control**
   - Execution monitoring
   - Process interruption
   - Connection management

## Security Considerations
- SSH key-based authentication only
- Secure credential storage
- LAN-only access restrictions
- Command validation and sanitization
- Rate limiting and timeout controls

## Scalability Notes
- Modular architecture for future expansion
- Support for additional input channels
- Extensible command translation system
- Configurable output formatting
- Monitoring and logging infrastructure