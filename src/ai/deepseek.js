const axios = require('axios');
const { SYSTEM_PROMPT, COMMAND_TRANSLATION_TEMPLATE } = require('./prompts');

class DeepSeekAI {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.baseURL = options.baseURL || 'https://api.deepseek.com/v1';
        this.options = {
            temperature: options.temperature || 0.7,
            maxTokens: options.maxTokens || 1000,
            ...options
        };
    }

    /**
     * Initialize the AI system
     */
    async initialize() {
        // Validate API key and connection
        try {
            // Test API connection
            await this.testConnection();
            console.log('DeepSeek AI initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize DeepSeek AI:', error);
            throw error;
        }
    }

    /**
     * Test the API connection
     */
    async testConnection() {
        try {
            // Simple test call to verify API key and connection
            await this.callAPI('Hello, are you ready?', true);
            return true;
        } catch (error) {
            console.error('API connection test failed:', error);
            throw error;
        }
    }

    /**
     * Translate a natural language command into system commands
     * @param {import('./types').CommandContext} context
     * @returns {Promise<import('./types').AIResponse>}
     */
    async translateCommand(context) {
        try {
            // Replace template variables
            const prompt = COMMAND_TRANSLATION_TEMPLATE
                .replace('{{input}}', context.input)
                .replace('{{history}}', JSON.stringify(context.history || []))
                .replace('{{systemState}}', JSON.stringify(context.systemState || {}));

            // Call DeepSeek API
            const response = await this.callAPI(prompt);

            // Parse and validate response
            const parsedResponse = this.parseResponse(response);

            // Add confidence check
            if (parsedResponse.confidence < 0.8) {
                parsedResponse.warnings = parsedResponse.warnings || [];
                parsedResponse.warnings.push('Low confidence in command translation');
            }

            return parsedResponse;
        } catch (error) {
            console.error('Command translation failed:', error);
            throw error;
        }
    }

    /**
     * Make a call to the DeepSeek API
     * @param {string} prompt - The prompt to send
     * @param {boolean} [isTest] - Whether this is a test call
     */
    async callAPI(prompt, isTest = false) {
        try {
            const response = await axios.post(`${this.baseURL}/chat/completions`, {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: isTest ? 'Respond with "Ready"' : SYSTEM_PROMPT
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: this.options.temperature,
                max_tokens: this.options.maxTokens
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    /**
     * Parse and validate the API response
     * @param {string} response - Raw API response
     * @returns {import('./types').AIResponse}
     */
    parseResponse(response) {
        try {
            const parsed = JSON.parse(response);

            // Validate required fields
            if (!parsed.translation || !parsed.translation.command) {
                throw new Error('Invalid response format: missing required fields');
            }

            return parsed;
        } catch (error) {
            console.error('Response parsing failed:', error);
            throw error;
        }
    }
}

module.exports = DeepSeekAI;
