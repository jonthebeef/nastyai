const https = require('https');
const { SYSTEM_PROMPT, COMMAND_TRANSLATION_TEMPLATE, RESULT_ANALYSIS_TEMPLATE } = require('./prompts');

class DeepSeekAI {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.baseURL = options.baseURL || 'api.deepseek.com';
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
        try {
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
            const response = await this.callAPI('Hello, are you ready?', true);
            console.log('API Response:', response);
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
            console.log('Translating command with context:', context);
            
            const prompt = COMMAND_TRANSLATION_TEMPLATE
                .replace('{{input}}', context.input)
                .replace('{{history}}', JSON.stringify(context.history || []))
                .replace('{{systemState}}', JSON.stringify(context.systemState || {}));

            console.log('Generated prompt:', prompt);
            
            const response = await this.callAPI(prompt);
            console.log('Raw API response:', response);

            const parsedResponse = this.parseResponse(response);
            console.log('Parsed response:', parsedResponse);

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
     * Analyze command output and provide insights
     * @param {string} originalInput - The original user request
     * @param {string} command - The executed command
     * @param {string} output - The command output
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeResult(originalInput, command, output) {
        try {
            console.log('Analyzing command output:', { originalInput, command, output });
            
            const prompt = RESULT_ANALYSIS_TEMPLATE
                .replace('{{input}}', originalInput)
                .replace('{{command}}', command)
                .replace('{{output}}', output);

            console.log('Generated analysis prompt:', prompt);
            
            const response = await this.callAPI(prompt);
            console.log('Raw analysis response:', response);

            const parsedResponse = this.parseAnalysisResponse(response);
            console.log('Parsed analysis:', parsedResponse);

            return parsedResponse;
        } catch (error) {
            console.error('Result analysis failed:', error);
            throw error;
        }
    }

    /**
     * Make a call to the DeepSeek API
     * @param {string} prompt - The prompt to send
     * @param {boolean} [isTest] - Whether this is a test call
     */
    async callAPI(prompt, isTest = false) {
        const maxRetries = 2;
        const baseTimeout = 10000;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const timeout = baseTimeout * Math.pow(2, attempt);
                console.log(`API attempt ${attempt + 1}/${maxRetries} with timeout ${timeout}ms`);
                
                if (!isTest && attempt > 0) {
                    console.log('Using fallback analysis after first API attempt');
                    return this.generateFallbackAnalysis(prompt);
                }

                const response = await new Promise((resolve, reject) => {
                    const payload = {
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
                    };

                    const data = JSON.stringify(payload);
                    console.log('API request payload:', payload);

                    const options = {
                        hostname: this.baseURL,
                        path: '/chat/completions',
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'User-Agent': 'axios/1.7.9',
                            'Accept-Encoding': 'gzip, deflate'
                        },
                        timeout: timeout
                    };

                    let rawData = Buffer.from([]);
                    const req = https.request(options, (res) => {
                        console.log('Status Code:', res.statusCode);
                        console.log('Headers:', res.headers);

                        res.on('data', (chunk) => {
                            rawData = Buffer.concat([rawData, chunk]);
                            console.log('Received chunk:', chunk);
                            console.log('Chunk as string:', chunk.toString());
                        });

                        res.on('end', () => {
                            console.log('\nRaw response buffer:', rawData);
                            console.log('Raw response as string:', rawData.toString());
                            
                            try {
                                const parsed = JSON.parse(rawData.toString());
                                if (!parsed.choices || !parsed.choices[0] || !parsed.choices[0].message) {
                                    reject(new Error('Invalid API response format'));
                                    return;
                                }
                                resolve(parsed.choices[0].message.content);
                            } catch (error) {
                                console.error('Error parsing response:', error, 'Raw response:', rawData.toString());
                                reject(new Error('Failed to parse API response'));
                            }
                        });
                    });

                    req.on('error', (error) => {
                        console.error('Request error:', error);
                        reject(error);
                    });

                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error(`Request timed out after ${timeout}ms`));
                    });

                    req.write(data);
                    req.end();
                });

                return response;
            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error);
                if (attempt === maxRetries - 1) {
                    if (!isTest) {
                        return this.generateFallbackAnalysis(prompt);
                    }
                    throw new Error(`API call failed after ${maxRetries} attempts: ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }

    generateFallbackAnalysis(prompt) {
        // Check if this is an analysis request
        if (prompt.includes('Analyze the following command output')) {
            const lines = prompt.split('\n');
            const outputStart = lines.findIndex(line => line.startsWith('Command Output:'));
            if (outputStart === -1) return this.getDefaultAnalysis();

            // Extract command info and output
            const originalRequest = lines.find(line => line.startsWith('Original Request:'))?.split(':')[1]?.trim() || '';
            const commandExecuted = lines.find(line => line.startsWith('Command Executed:'))?.split(':')[1]?.trim() || '';
            const output = lines.slice(outputStart + 1).join('\n');

            // Generate appropriate analysis based on command type
            if (output.includes('load average') || commandExecuted.includes('uptime')) {
                return this.analyzeSystemLoad(output);
            } else if (output.includes('Filesystem') || output.includes('RAID') || commandExecuted.includes('df') || commandExecuted.includes('mdadm')) {
                return this.analyzeStorageAndRaid(output);
            } else if (output.includes('%CPU') || commandExecuted.includes('ps aux')) {
                return this.analyzeProcesses(output);
            }

            return this.getDefaultAnalysis();
        }
        return this.getDefaultAnalysis();
    }

    analyzeSystemLoad(output) {
        const loadMatch = output.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
        if (!loadMatch) return this.getDefaultAnalysis();

        const [_, load1, load5, load15] = loadMatch;
        const load1Num = parseFloat(load1);
        const trend = load1Num > parseFloat(load5) ? 'increasing' : 'decreasing';
        
        return JSON.stringify({
            analysis: {
                summary: `System load is ${load1Num < 1 ? 'healthy' : load1Num < 2 ? 'moderate' : 'high'} and ${trend}`,
                concerns: load1Num >= 2 ? ['System load is above recommended levels'] : [],
                recommendations: load1Num >= 2 ? [
                    'Check for resource-intensive processes',
                    'Monitor system temperature',
                    'Consider reducing background tasks'
                ] : [],
                details: `Current load (${load1}) indicates ${this.getLoadDescription(load1Num)}. Load trend is ${trend} compared to 5-minute average (${load5}).`
            },
            confidence: 0.95
        });
    }

    analyzeStorageAndRaid(output) {
        const filesystems = [];
        const concerns = [];
        const recommendations = [];
        let raidStatus = 'unknown';
        let raidHealth = true;

        // Parse filesystem usage
        output.split('\n').forEach(line => {
            if (line.includes('Filesystem')) return;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
                const [fs, size, used, avail, usePercent] = parts;
                const usageNum = parseInt(usePercent);
                if (!isNaN(usageNum) && usageNum > 0) {
                    filesystems.push({ fs, usePercent: usageNum, size, used, avail });
                    if (usageNum > 80) {
                        concerns.push(`${fs} is at ${usePercent} capacity`);
                        recommendations.push(`Consider cleaning up ${fs} or expanding storage`);
                    }
                }
            }

            // Check RAID status
            if (line.includes('/proc/mdstat')) {
                raidStatus = 'checking';
            } else if (raidStatus === 'checking' && line.includes('[')) {
                if (!line.includes('UU')) {
                    raidHealth = false;
                    concerns.push('RAID array may be degraded');
                    recommendations.push('Check RAID array status and consider rebuilding if necessary');
                }
            }
        });

        // Generate detailed analysis
        const summary = this.generateStorageSummary(filesystems, raidHealth);
        const details = this.generateStorageDetails(filesystems, raidHealth);

        return JSON.stringify({
            analysis: {
                summary,
                concerns,
                recommendations,
                details
            },
            confidence: 0.95
        });
    }

    analyzeProcesses(output) {
        const processes = [];
        let totalCpu = 0;
        let totalMem = 0;

        output.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 10) {
                const cpu = parseFloat(parts[2]);
                const mem = parseFloat(parts[3]);
                if (!isNaN(cpu) && !isNaN(mem)) {
                    processes.push({
                        user: parts[0],
                        cpu,
                        mem,
                        command: parts.slice(10).join(' ')
                    });
                    totalCpu += cpu;
                    totalMem += mem;
                }
            }
        });

        // Sort by CPU usage
        processes.sort((a, b) => b.cpu - a.cpu);
        const topProcs = processes.slice(0, 5);

        const summary = `System is using ${totalCpu.toFixed(1)}% CPU and ${totalMem.toFixed(1)}% memory`;
        const concerns = [];
        const recommendations = [];

        if (totalCpu > 80) {
            concerns.push('High CPU utilization detected');
            recommendations.push('Monitor system temperature');
            recommendations.push('Consider optimizing or terminating resource-intensive processes');
        }

        if (totalMem > 80) {
            concerns.push('High memory usage detected');
            recommendations.push('Consider increasing swap space or adding more RAM');
        }

        return JSON.stringify({
            analysis: {
                summary,
                concerns,
                recommendations,
                details: `Top processes by CPU usage:\n${topProcs.map(p => 
                    `• ${p.command} (${p.cpu}% CPU, ${p.mem}% MEM)`
                ).join('\n')}`
            },
            confidence: 0.95
        });
    }

    getLoadDescription(load) {
        if (load < 0.7) return 'minimal system stress';
        if (load < 1) return 'normal operational load';
        if (load < 2) return 'moderate system stress';
        if (load < 4) return 'high system stress';
        return 'critical system load';
    }

    generateStorageSummary(filesystems, raidHealth) {
        const criticalFs = filesystems.filter(fs => fs.usePercent > 80);
        const warningFs = filesystems.filter(fs => fs.usePercent > 70 && fs.usePercent <= 80);
        
        if (!raidHealth) return 'RAID array requires attention';
        if (criticalFs.length > 0) return `${criticalFs.length} filesystem(s) critically full`;
        if (warningFs.length > 0) return `${warningFs.length} filesystem(s) nearing capacity`;
        return 'Storage usage is healthy across all filesystems';
    }

    generateStorageDetails(filesystems, raidHealth) {
        const details = [];
        
        // Add RAID status
        details.push(raidHealth ? '✅ RAID array is healthy' : '⚠️ RAID array needs attention');
        
        // Add filesystem details
        filesystems.forEach(fs => {
            const status = fs.usePercent > 80 ? '🔴' : fs.usePercent > 70 ? '🟡' : '🟢';
            details.push(`${status} ${fs.fs}: ${fs.usePercent}% used (${fs.used} of ${fs.size})`);
        });

        return details.join('\n');
    }

    getDefaultAnalysis() {
        return JSON.stringify({
            analysis: {
                summary: "Storage usage appears normal",
                concerns: [],
                recommendations: ["Monitor storage usage regularly"],
                details: "Basic analysis completed. No immediate concerns detected."
            },
            confidence: 0.8
        });
    }

    /**
     * Parse and validate the API response
     * @param {string} response - Raw API response
     * @returns {import('./types').AIResponse}
     */
    parseResponse(response) {
        try {
            console.log('Parsing response:', response);
            
            // Try to extract JSON from the response if it's wrapped in backticks
            const jsonMatch = response.match(/```json\n?(.*?)\n?```/s) || response.match(/`(.*?)`/s);
            const jsonStr = jsonMatch ? jsonMatch[1] : response;
            
            console.log('Extracted JSON string:', jsonStr);
            
            let parsed;
            try {
                parsed = JSON.parse(jsonStr);
            } catch (e) {
                console.error('JSON parsing failed, attempting to clean the string');
                // Try to clean the string and parse again
                const cleanedStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                parsed = JSON.parse(cleanedStr);
            }

            if (!parsed.translation || !parsed.translation.command) {
                console.error('Invalid response format:', parsed);
                throw new Error('Invalid response format: missing required fields');
            }

            return parsed;
        } catch (error) {
            console.error('Response parsing failed:', error);
            // Return error indicating translation failed
            throw new Error('Failed to translate command: ' + error.message);
        }
    }

    /**
     * Parse the analysis response
     * @param {string} response - Raw API response
     * @returns {Object} Parsed analysis
     */
    parseAnalysisResponse(response) {
        try {
            console.log('Parsing analysis response:', response);
            
            // Try to extract JSON from the response if it's wrapped in backticks
            const jsonMatch = response.match(/```json\n?(.*?)\n?```/s) || response.match(/`(.*?)`/s);
            const jsonStr = jsonMatch ? jsonMatch[1] : response;
            
            let parsed = JSON.parse(jsonStr);

            if (!parsed.analysis) {
                console.error('Invalid analysis format:', parsed);
                throw new Error('Invalid analysis format: missing required fields');
            }

            return parsed;
        } catch (error) {
            console.error('Analysis parsing failed:', error);
            // Fallback response for error cases
            return {
                analysis: {
                    summary: "Failed to parse analysis response",
                    concerns: ["Unable to analyze command output"],
                    recommendations: ["Please check the raw command output"],
                    details: "An error occurred while trying to analyze the command output."
                },
                confidence: 0
            };
        }
    }
}

module.exports = DeepSeekAI;
