import "dotenv/config";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

async function test(name: string) {
  const key = process.env.GOOGLE_API_KEY;
  console.log(`\nTesting "${name}"...`);
  const t0 = Date.now();
  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: key,
      model: name,
      maxRetries: 0,
    });
    const res = await model.invoke("Say 'System is operational' in 3 words.");
    console.log(`✅ [${name}] Success in ${Date.now() - t0}ms: "${res.content.toString().trim()}"`);
  } catch (err: any) {
    console.error(`❌ [${name}] Error in ${Date.now() - t0}ms:`, err?.message || err);
  }
}

async function run() {
  const candidates = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
  ];
  for (const c of candidates) {
    await test(c);
  }
}

run();
