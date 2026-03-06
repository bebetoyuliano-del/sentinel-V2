import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

async function testGemini() {
  console.log('--- Testing Gemini API Access ---');
  
  const keys = {
    API_KEY: process.env.API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY
  };

  console.log('Environment Keys:');
  for (const [k, v] of Object.entries(keys)) {
    console.log(`${k}: ${v ? (v.startsWith('AIza') ? 'Valid Prefix' : 'Invalid Prefix') : 'Missing'} (${v ? v.substring(0, 5) + '...' : ''})`);
  }

  const key = process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error('CRITICAL: No API Key found!');
    return;
  }

  const ai = new GoogleGenAI({ apiKey: key });
  
  const modelsToTest = [
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash' // Just to check if *any* model works
  ];

  for (const model of modelsToTest) {
    console.log(`\nTesting model: ${model}...`);
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: 'Hello, are you working?',
      });
      console.log(`SUCCESS: ${model} responded: "${response.text.trim()}"`);
    } catch (error: any) {
      console.error(`FAILED: ${model} error:`, error.message || error);
      if (error.response) {
        console.error('Error details:', JSON.stringify(error.response, null, 2));
      }
    }
  }
}

testGemini();
