import 'dotenv/config';
import twilio = require('twilio');

async function debugSetup() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const targetNumber = process.argv[2];

  console.log('================ TWILIO CONFIG DEBUGGER ================');
  console.log('1. Checking Environment Variables...');
  console.log('   TWILIO_ACCOUNT_SID:', accountSid ? '✅ Present' : '❌ Missing');
  console.log('   TWILIO_AUTH_TOKEN :', authToken ? '✅ Present' : '❌ Missing');
  console.log('   TWILIO_PHONE_NUMBER (FROM):', fromNumber || '❌ Missing');

  if (!accountSid || !authToken || !fromNumber) {
    console.error('\n❌ Missing required Twilio configuration in .env');
    return;
  }

  const client = (twilio as any).default ? (twilio as any).default(accountSid, authToken) : twilio(accountSid, authToken);

  console.log('\n2. Checking Account Connection & Purchased Numbers...');
  try {
    const incomingNumbers = await client.incomingPhoneNumbers.list({ limit: 10 });
    console.log(`   Found ${incomingNumbers.length} purchased Twilio number(s):`);
    incomingNumbers.forEach((n) => console.log(`   - ${n.phoneNumber} (${n.friendlyName})`));

    const matchesFrom = incomingNumbers.some((n) => n.phoneNumber === fromNumber);
    if (matchesFrom) {
      console.log(`   ✅ TWILIO_PHONE_NUMBER (${fromNumber}) is verified as an active incoming number!`);
    } else {
      console.warn(`   ⚠️ WARNING: ${fromNumber} was NOT found in your purchased numbers list!`);
    }
  } catch (err: any) {
    console.error('   ❌ Failed to query Twilio account:', err?.message);
    return;
  }

  console.log('\n3. Checking Verified Caller IDs (Allowed recipient numbers on Trial)...');
  try {
    const verified = await client.outgoingCallerIds.list({ limit: 20 });
    console.log(`   Found ${verified.length} verified number(s):`);
    verified.forEach((v) => console.log(`   - ${v.phoneNumber} (${v.friendlyName})`));

    if (targetNumber) {
      const isVerified = verified.some((v) => v.phoneNumber === targetNumber);
      if (isVerified) {
        console.log(`\n   ✅ Target Number (${targetNumber}) IS VERIFIED! You can call it!`);
      } else {
        console.log(`\n   ❌ Target Number (${targetNumber}) is NOT in Verified Caller IDs.`);
        console.log('      Go to https://console.twilio.com/us1/develop/phone-numbers/manage/verified to add it.');
      }
    } else {
      console.log('\n   💡 Tip: Pass your target VoIP number as argument to check it:');
      console.log('      npx ts-node debug-twilio.ts +YOUR_VOIP_NUMBER');
    }
  } catch (err: any) {
    console.error('   ❌ Failed to query verified caller IDs:', err?.message);
  }
  console.log('========================================================');
}

debugSetup();
