const https = require('https');

async function testDeepSeekAPI(apiKey, question) {
    const payload = {
        model: 'deepseek-chat',
        messages: [
            {
                role: 'user',
                content: question
            }
        ],
        temperature: 0.7,
        max_tokens: 1000
    };

    const options = {
        hostname: 'api.deepseek.com',
        path: '/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            console.log('Status Code:', res.statusCode);
            console.log('Headers:', res.headers);

            let rawData = Buffer.from([]);
            res.on('data', (chunk) => {
                rawData = Buffer.concat([rawData, chunk]);
                console.log('Received chunk:', chunk);
                console.log('Chunk as string:', chunk.toString());
            });

            res.on('end', () => {
                console.log('\nRaw response buffer:', rawData);
                console.log('Raw response as string:', rawData.toString());
                
                try {
                    // Try to parse as JSON
                    const parsedData = JSON.parse(rawData.toString());
                    console.log('\nParsed JSON response:', JSON.stringify(parsedData, null, 2));
                    resolve(parsedData);
                } catch (e) {
                    console.error('Failed to parse JSON:', e);
                    // Return raw data if JSON parsing fails
                    resolve({
                        error: 'JSON parsing failed',
                        rawData: rawData.toString(),
                        rawBuffer: rawData
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });

        req.write(JSON.stringify(payload));
        req.end();
    });
}

// Test the API with a simple question
if (require.main === module) {
    require('dotenv').config();
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        console.error('No API key found in environment variables');
        process.exit(1);
    }

    const testQuestion = process.argv[2] || 'What is 2+2?';
    
    console.log('Testing DeepSeek API with question:', testQuestion);
    testDeepSeekAPI(apiKey, testQuestion)
        .then(result => {
            console.log('\nTest completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

module.exports = testDeepSeekAPI; 