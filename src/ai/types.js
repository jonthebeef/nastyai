/**
 * @typedef {Object} CommandContext
 * @property {string} input - The user's natural language input
 * @property {string[]} [history] - Previous conversation history
 * @property {Object} [systemState] - Current system state information
 * @property {boolean} [requiresConfirmation] - Whether this command needs explicit confirmation
 */

/**
 * @typedef {Object} TranslatedCommand
 * @property {string} command - The translated system command
 * @property {string[]} [subCommands] - Array of commands if task requires multiple steps
 * @property {string} explanation - Human-readable explanation of what the command will do
 * @property {boolean} requiresConfirmation - Whether this command needs explicit confirmation
 * @property {Object} [metadata] - Additional information about the command
 */

/**
 * @typedef {Object} AIResponse
 * @property {TranslatedCommand} translation - The translated command
 * @property {number} confidence - Confidence score (0-1) of the translation
 * @property {string[]} [warnings] - Any warnings about the command execution
 * @property {Object} [context] - Context information for future interactions
 */

module.exports = {};  // Types are for documentation only
