import 'dotenv/config';

async function listModels() {
  const key = process.env.GOOGLE_API_KEY;
  console.log('Using API Key:', key ? `${key.substring(0, 8)}...` : 'NONE');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const response = await fetch(url);
    const data: any = await response.json();

    if (data.error) {
      console.error('❌ Google API Error:', data.error);
      return;
    }

    console.log('✅ Connected to Google Gemini API successfully!');
    console.log('Available models for generateContent:');
    const generateModels = (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''));

    generateModels.forEach((m: string) => console.log(` - ${m}`));
  } catch (err: any) {
    console.error('Fetch error:', err?.message || err);
  }
}

listModels();
