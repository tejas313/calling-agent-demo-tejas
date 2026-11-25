import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ClinicalPriority } from '../common/constants';

export interface ExtractedReferralData {
  patientName: string;
  patientPhone: string;
  patientDob?: string;
  healthCardNumber?: string;
  referringPhysicianName: string;
  referringPhysicianBillingNumber?: string;
  referringPhysicianContact?: string;
  referralReason: string;
  clinicalSymptoms: string[];
  specialtyRequired: string;
  clinicalPriority: ClinicalPriority;
  targetWaitDays: number;
  confidenceScore: number;
  rawSummary: string;
}

@Injectable()
export class ReferralExtractionService {
  private readonly logger = new Logger(ReferralExtractionService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Extracts structured clinical and administrative referral data from text
   * using OpenAI if OPENAI_API_KEY is configured, or Gemini as fallback.
   */
  async extractReferralData(documentText: string): Promise<ExtractedReferralData> {
    const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    const googleApiKey = this.configService.get<string>('GOOGLE_API_KEY');

    const systemPrompt = `You are an expert medical triage and referral intake AI assistant.
Extract patient details, referral reason, urgency/clinical priority, and referring physician details from the provided medical referral document.

You MUST output ONLY a valid JSON object matching this schema:
{
  "patientName": "string",
  "patientPhone": "string (E.164 if possible or standard phone format)",
  "patientDob": "YYYY-MM-DD or empty string",
  "healthCardNumber": "string or empty",
  "referringPhysicianName": "string",
  "referringPhysicianBillingNumber": "string or empty",
  "referringPhysicianContact": "string or empty",
  "referralReason": "concise clinical summary of referral reason",
  "clinicalSymptoms": ["array of symptom strings"],
  "specialtyRequired": "specialty name, e.g. Cardiology, Family Medicine, Internal Medicine, Dermatology, Orthopedics",
  "clinicalPriority": "RED_STAR" | "BLUE_STAR" | "URGENT" | "SEMI_URGENT" | "ROUTINE",
  "targetWaitDays": number (e.g. 2 for RED_STAR, 7 for URGENT, 14 for BLUE_STAR/SEMI_URGENT, 30-60 for ROUTINE),
  "confidenceScore": number between 0.0 and 1.0,
  "rawSummary": "1-2 sentence clinical summary"
}

Priority Guidelines:
- RED_STAR: Severe, unstable, high-risk complication, or life/organ-threatening if delayed >48h.
- URGENT: Acute symptoms requiring evaluation within 3-7 days.
- BLUE_STAR: Expedited or moderate risk needing care within 7-14 days.
- SEMI_URGENT: Subacute, needs care within 14-30 days.
- ROUTINE: Stable chronic symptoms, checkup, preventative within 30-60 days.`;

    if (openAiApiKey) {
      this.logger.log('Extracting referral using OpenAI model...');
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: documentText },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          },
          {
            headers: {
              Authorization: `Bearer ${openAiApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 20000,
          },
        );

        const content = response.data?.choices?.[0]?.message?.content;
        return this.parseAndValidate(content, documentText);
      } catch (err: any) {
        this.logger.warn(`OpenAI extraction error: ${err?.message}. Falling back to Gemini...`);
      }
    }

    // Gemini extraction
    if (googleApiKey) {
      this.logger.log('Extracting referral using Gemini model...');
      try {
        const gemini = new ChatGoogleGenerativeAI({
          apiKey: googleApiKey,
          model: this.configService.get<string>('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
          temperature: 0.1,
          maxOutputTokens: 1024,
        });

        const result = await gemini.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(`Referral Document Text:\n${documentText}`),
        ]);

        const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        return this.parseAndValidate(content, documentText);
      } catch (geminiErr: any) {
        this.logger.error(`Gemini extraction failed: ${geminiErr?.message}`);
      }
    }

    // Rule-based fallback if no LLM API responded
    this.logger.warn('Falling back to deterministic rule-based referral parser.');
    return this.fallbackRegexExtraction(documentText);
  }

  private parseAndValidate(rawJson: string, originalText: string): ExtractedReferralData {
    try {
      const cleanJson = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      let priority = parsed.clinicalPriority as ClinicalPriority;
      if (!Object.values(ClinicalPriority).includes(priority)) {
        priority = ClinicalPriority.ROUTINE;
      }

      return {
        patientName: parsed.patientName || 'Unknown Patient',
        patientPhone: parsed.patientPhone || '',
        patientDob: parsed.patientDob || undefined,
        healthCardNumber: parsed.healthCardNumber || undefined,
        referringPhysicianName: parsed.referringPhysicianName || 'Referring Provider',
        referringPhysicianBillingNumber: parsed.referringPhysicianBillingNumber || undefined,
        referringPhysicianContact: parsed.referringPhysicianContact || undefined,
        referralReason: parsed.referralReason || originalText.substring(0, 200),
        clinicalSymptoms: Array.isArray(parsed.clinicalSymptoms) ? parsed.clinicalSymptoms : [],
        specialtyRequired: parsed.specialtyRequired || 'Family Medicine',
        clinicalPriority: priority,
        targetWaitDays: Number(parsed.targetWaitDays) || 30,
        confidenceScore: Number(parsed.confidenceScore) || 0.9,
        rawSummary: parsed.rawSummary || 'Extracted medical referral',
      };
    } catch (e: any) {
      this.logger.error(`Failed to parse LLM extraction JSON: ${e?.message}`);
      return this.fallbackRegexExtraction(originalText);
    }
  }

  private fallbackRegexExtraction(text: string): ExtractedReferralData {
    const isUrgent = /urgent|emergency|chest pain|severe|critical|shortness of breath/i.test(text);
    const isRedStar = /immediate|acute distress|severe complication|red star/i.test(text);

    let priority = ClinicalPriority.ROUTINE;
    let targetDays = 30;

    if (isRedStar) {
      priority = ClinicalPriority.RED_STAR;
      targetDays = 2;
    } else if (isUrgent) {
      priority = ClinicalPriority.URGENT;
      targetDays = 7;
    }

    const patientNameMatch = text.match(/patient(?:\s+name)?[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/);
    const physicianMatch = text.match(/(?:Dr\.|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    const specialtyMatch = text.match(/(Cardiology|Family Medicine|Internal Medicine|Dermatology|Surgery|Pediatrics)/i);

    return {
      patientName: patientNameMatch ? patientNameMatch[1] : 'Patient',
      patientPhone: phoneMatch ? phoneMatch[0] : '+14165550000',
      referringPhysicianName: physicianMatch ? `Dr. ${physicianMatch[1]}` : 'Referring Doctor',
      referralReason: text.substring(0, 250),
      clinicalSymptoms: isUrgent ? ['Acute symptoms'] : ['Routine evaluation'],
      specialtyRequired: specialtyMatch ? specialtyMatch[1] : 'Family Medicine',
      clinicalPriority: priority,
      targetWaitDays: targetDays,
      confidenceScore: 0.75,
      rawSummary: 'Rule-based extracted referral',
    };
  }
}

