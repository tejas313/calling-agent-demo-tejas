import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

const testNumber = process.argv[2] || '+14165551234';

console.log(`Checking number: ${testNumber}`);

if (!isValidPhoneNumber(testNumber)) {
  console.log('Result: ❌ Invalid phone number!');
} else {
  const parsed = parsePhoneNumber(testNumber);
  console.log('Result: ✅ Valid phone number!');
  console.log('Country:', parsed.country);
  console.log('Country Calling Code:', `+${parsed.countryCallingCode}`);
  console.log('National Number:', parsed.nationalNumber);
  console.log('International Format (E.164):', parsed.format('E.164'));
  console.log('National Format:', parsed.formatNational());
  console.log('Line Type:', parsed.getType() || 'UNKNOWN');
}
