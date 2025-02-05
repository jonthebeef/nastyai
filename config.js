/*
 Configuration file for the Mac Command Center
 This file stores configuration details such as the server port and SSH connection info for the Raspberry Pi NAS.
*/

module.exports = {
  // Server port on which the Express server will listen. Can be overridden by the PORT environment variable.
  port: process.env.PORT || 3000,

  // SSH connection details for the Raspberry Pi NAS
  ssh: {
    // Hostname or IP address of the Raspberry Pi. As per the documentation, the SSH user is 'pi' and host is 'nasty'.
    host: process.env.SSH_HOST || 'nasty',
    
    // Username for the SSH connection
    username: process.env.SSH_USERNAME || 'pi',

    // Path to the private key file used for authentication
    privateKey: process.env.SSH_PRIVATE_KEY || '/Users/jongrant/.ssh/id_rsa'
  },

  // Discord bot configuration
  discord: {
    // Discord bot token from Discord Developer Portal
    token: process.env.DISCORD_TOKEN,

    // Command prefix for bot commands (default: !)
    prefix: process.env.DISCORD_PREFIX || '!',

    // Optional: List of allowed Discord channel IDs (empty array means all channels)
    allowedChannels: (process.env.DISCORD_CHANNELS || '').split(',').filter(Boolean)
  }
}; 