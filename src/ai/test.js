require('dotenv').config();
const DeepSeekAI = require('./deepseek');

async function testDeepSeek() {
    const ai = new DeepSeekAI(process.env.DEEPSEEK_API_KEY);

    try {
        // Test initialization
        console.log('Testing DeepSeek AI initialization...');
        await ai.initialize();

        // Test command translation
        console.log('\nTesting command translation...');
        const context = {
            input: 'show me the current disk space usage',
            history: [],
            systemState: {}
        };

        const result = await ai.translateCommand(context);
        console.log('\nTranslation result:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testDeepSeek(); 