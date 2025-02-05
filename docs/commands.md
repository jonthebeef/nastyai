# Command Center Documentation

## System Status & Monitoring

| Command | Description | Output |
|---------|-------------|---------|
| `status` | Shows comprehensive system status | Uptime, memory usage, disk space |
| `system status` | Alias for `status` | Same as status |
| `uptime` | Shows system uptime and load | System uptime, number of users, load averages |
| `monitor` | Full system monitoring view | System load, memory usage, storage usage, CPU temperature, top processes |

## Memory Management

| Command | Description | Output |
|---------|-------------|---------|
| `memory` | Shows memory statistics | Total, used, free, shared, buffer/cache, available memory |
| `ram` | Alias for `memory` | Same as memory |
| `memory usage` | Alias for `memory` | Same as memory |

## Storage & RAID

| Command | Description | Output |
|---------|-------------|---------|
| `disk space` | Shows filesystem usage | Filesystem size, used space, available space, use percentage |
| `disk usage` | Alias for `disk space` | Same as disk space |
| `storage` | Alias for `disk space` | Same as disk space |
| `disk list` | Lists all block devices | Device names, sizes, types, mount points, filesystems |
| `smart status` | Checks disk health | SMART status of /dev/sda |

## Temperature Monitoring

| Command | Description | Output |
|---------|-------------|---------|
| `temperature` | Shows CPU temperature | Current CPU temperature |
| `temp` | Alias for `temperature` | Same as temperature |
| `cpu temp` | Alias for `temperature` | Same as temperature |
| `watch temps` | Shows CPU and disk temperatures | CPU temperature and disk temperature (if available) |

## Process Management

| Command | Description | Output |
|---------|-------------|---------|
| `processes` | Lists running processes | Top 10 processes with details |
| `top processes` | Shows CPU-intensive processes | Top 5 processes sorted by CPU usage |

## Network Management

| Command | Description | Output |
|---------|-------------|---------|
| `network` | Shows network configuration | Network interfaces and routing information |
| `ip` | Shows IP addresses | Hostname IP and detailed interface information |
| `network status` | Detailed network status | Network interfaces and routing table |
| `ports` | Shows open ports | List of open ports and listening services |
| `connections` | Alias for `ports` | Same as ports |
| `wifi` | Shows WiFi status | Current WiFi connection and available networks |
| `wifi status` | Shows detailed WiFi info | Active connections and signal strength |
| `tailscale` | Shows Tailscale VPN status | Tailscale network status and peers |
| `tailscale status` | Alias for `tailscale` | Same as tailscale |
| `bluetooth` | Shows Bluetooth status | Bluetooth service status and paired devices |
| `bluetooth status` | Alias for `bluetooth` | Same as bluetooth |

## File System Operations

| Command | Description | Output |
|---------|-------------|---------|
| `ls` | Lists files and directories | Detailed list with permissions, sizes, dates |
| `list` | Alias for `ls` | Same as ls |
| `files` | Alias for `ls` | Same as ls |
| `pwd` | Shows current directory | Current working directory path |
| `current dir` | Alias for `pwd` | Same as pwd |

## Docker Management

| Command | Description | Output |
|---------|-------------|---------|
| `docker ps` | Lists containers | All containers (running and stopped) |
| `docker containers` | Alias for `docker ps` | Same as docker ps |
| `docker images` | Lists images | All available Docker images |
| `docker status` | Shows Docker status | Docker system information |
| `docker version` | Shows Docker version | Docker version information |
| `docker *` | Any other Docker command | Passes through to Docker CLI |

## Share Management

| Command | Description | Output |
|---------|-------------|---------|
| `share status` | Shows network share status | Status of Samba services |

## Power Management

| Command | Description | Output |
|---------|-------------|---------|
| `shutdown` | Initiates shutdown sequence | System status check and shutdown warning |
| `shutdown confirm` | Confirms shutdown | Final system check and initiates shutdown with 1-minute delay |
| `reboot` | Initiates reboot sequence | System status check and reboot warning |
| `reboot confirm` | Confirms reboot | Final system check and initiates reboot with 1-minute delay |
| `shutdown cancel` | Cancels pending shutdown/reboot | Cancellation confirmation |
| `shutdown status` | Shows pre-shutdown status | Current system status without initiating shutdown |

## Help

| Command | Description | Output |
|---------|-------------|---------|
| `help` | Shows available commands | List of all command categories and basic usage |

## Storage Service Management

| Command | Description | Output |
|---------|-------------|---------|
| `raid` | Shows RAID array status | Current RAID status from /proc/mdstat |
| `raid status` | Alias for `raid` | Same as raid |
| `smart monitor` | Detailed SMART status | SMART health and attributes for disks |
| `disk events` | Shows recent disk events | Last 20 disk-related system events |

## System Service Management

| Command | Description | Output |
|---------|-------------|---------|
| `printers` | Shows printer status | Printer list and current print queue |
| `printer status` | Alias for `printers` | Same as printers |
| `cron list` | Shows scheduled tasks | System and user cron jobs |
| `cron status` | Alias for `cron list` | Same as cron list |
| `time sync` | Shows time synchronization | System time and NTP sync status |

## Hardware Management

| Command | Description | Output |
|---------|-------------|---------|
| `pi hardware` | Shows Pi hardware info | CPU, memory, and USB device details |
| `eeprom status` | Shows firmware status | Current firmware version and update status |

## Notes

1. All commands are case-insensitive
2. Many commands have aliases for convenience
3. Docker commands can be extended with standard Docker CLI arguments
4. Power management commands include safety checks and delays
5. Status commands provide real-time information
6. Service commands read existing configurations without modification 