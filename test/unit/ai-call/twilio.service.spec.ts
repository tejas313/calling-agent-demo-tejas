import { ConfigService } from '@nestjs/config';
import { TwilioService } from '../../../src/twilio/twilio.service';

describe('TwilioService', () => {
  const makeService = (
    rate?: string,
    speechTimeout?: string,
    voiceEn?: string,
    voiceFr?: string,
  ) => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC00000000000000000000000000000000';
        if (key === 'TWILIO_AUTH_TOKEN') return 'test-auth-token';
        if (key === 'TTS_SPEECH_RATE') return rate;
        if (key === 'STT_SPEECH_TIMEOUT') return speechTimeout;
        if (key === 'TTS_VOICE_EN') return voiceEn;
        if (key === 'TTS_VOICE_FR') return voiceFr;
        return undefined;
      }),
    } as unknown as ConfigService;
    return new TwilioService(configService);
  };

  it('uses Polly Generative voices, speechTimeout="1", bargeIn="false" on Turn 1, actionOnEmptyResult="true", and natural 100% rate without prosody wrapper by default', () => {
    const service = makeService();
    const twiml = service.generateLanguageSelectionTwiML('https://example.com/voice?callId=123');

    expect(twiml).toContain('voice="Polly.Danielle-Generative"');
    expect(twiml).toContain('voice="Polly.Lea-Generative"');
    expect(twiml).toContain('speechTimeout="1"');
    expect(twiml).toContain('bargeIn="false"');
    expect(twiml).toContain('actionOnEmptyResult="true"');
    expect(twiml).toContain('speechModel="phone_call"');
    expect(twiml).toContain('enhanced="true"');
    expect(twiml).not.toContain('<prosody');
    expect(twiml).not.toContain('<break');
  });

  it('uses configurable STT_SPEECH_TIMEOUT, TTS_VOICE_EN, prioritized extraHints, Redirect fallback, and custom TTS_SPEECH_RATE in Gather TwiML', () => {
    const service = makeService('92%', '3', 'Polly.Ruth-Generative');
    const twiml = service.generateGatherTwiML(
      'Hi Suresh, would you like to confirm, or do you need to cancel?',
      'https://example.com/voice?callId=123',
      'en',
      ['Hope One Clinic', 'Doctor Vikram Makhija'],
    );

    expect(twiml).toContain('speechTimeout="3"');
    expect(twiml).toContain('bargeIn="true"');
    expect(twiml).toContain('voice="Polly.Ruth-Generative"');
    expect(twiml).toContain('actionOnEmptyResult="true"');
    expect(twiml).toContain('<Redirect method="POST">https://example.com/voice?callId=123</Redirect>');
    expect(twiml).not.toContain('<Hangup/>');
    expect(twiml).toContain('yes confirm this appointment');
    expect(twiml).toContain('Hope One Clinic');
    expect(twiml).toContain('Doctor Vikram Makhija');
    expect(twiml).toContain('<prosody rate="92%">');
    expect(twiml).not.toContain('<break');
  });

  it('formats 12-hour times and wraps phone numbers in SSML say-as telephone for natural TTS', () => {
    const service = makeService();
    const body = service.formatSayBody(
      'Dr Vikram is available at 09:00 AM. Call +1-555-123-4567 for details.',
      'en',
    );

    expect(body).toContain('Doctor Vikram is available at 9 AM.');
    expect(body).toContain('<say-as interpret-as="telephone">+1-555-123-4567</say-as>');
  });

  it('caps hints at 500 characters and strips commas from extraHints', () => {
    const service = makeService();
    const twiml = service.generateGatherTwiML(
      'Hello!',
      'https://example.com/voice?callId=123&turn=2',
      'en',
      ['Clinic, One', 'A'.repeat(200)],
    );

    const hintsMatch = twiml.match(/hints="([^"]*)"/);
    expect(hintsMatch).not.toBeNull();
    expect(hintsMatch![1].length).toBeLessThanOrEqual(500);
    expect(hintsMatch![1]).toContain('Clinic One');
    expect(twiml).toContain('action="https://example.com/voice?callId=123&amp;turn=2"');
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
