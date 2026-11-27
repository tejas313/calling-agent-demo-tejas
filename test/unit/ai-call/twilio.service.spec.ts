import { ConfigService } from '@nestjs/config';
import { TwilioService } from '../../../src/twilio/twilio.service';

describe('TwilioService', () => {
  const makeService = (rate?: string) => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC00000000000000000000000000000000';
        if (key === 'TWILIO_AUTH_TOKEN') return 'test-auth-token';
        if (key === 'TTS_SPEECH_RATE') return rate;
        return undefined;
      }),
    } as unknown as ConfigService;
    return new TwilioService(configService);
  };

  it('uses speechTimeout="1" and natural 93% prosody rate for language selection', () => {
    const service = makeService();
    const twiml = service.generateLanguageSelectionTwiML('https://example.com/voice?callId=123');

    expect(twiml).toContain('speechTimeout="1"');
    expect(twiml).toContain('speechModel="phone_call"');
    expect(twiml).toContain('enhanced="true"');
    expect(twiml).toContain('<prosody rate="93%">');
  });

  it('uses speechTimeout="1", phrase hints, extraHints, and configured TTS_SPEECH_RATE in Gather TwiML', () => {
    const service = makeService('85%');
    const twiml = service.generateGatherTwiML(
      'Hello! Would you like to confirm?',
      'https://example.com/voice?callId=123',
      'en',
      ['Hope One Clinic', 'Doctor Vikram Makhija'],
    );

    expect(twiml).toContain('speechTimeout="1"');
    expect(twiml).toContain('yes please confirm');
    expect(twiml).toContain('Hope One Clinic');
    expect(twiml).toContain('Doctor Vikram Makhija');
    expect(twiml).toContain('<prosody rate="85%">');
    expect(twiml).toContain('<break time="220ms"/>');
  });

  it('strips internal markers and escapes XML safely', () => {
    const service = makeService();
    const twiml = service.generateTwiML(
      'Dr. Smith & Clinic confirmed. [SLOT_CONFIRMED] [CALL_COMPLETE]',
      'en',
    );

    expect(twiml).toContain('Doctor Smith &amp; Clinic confirmed.');
    expect(twiml).not.toContain('[SLOT_CONFIRMED]');
    expect(twiml).not.toContain('[CALL_COMPLETE]');
    expect(twiml).toContain('<Hangup/>');
  });
});
