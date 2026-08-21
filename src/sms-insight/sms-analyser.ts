/**
 * Turns SMS CONTENT into structured suggestions — profile-field updates to
 * propose, and survey questions to consider. It never changes anything: a
 * suggestion is reviewed by the person (for their profile) or an admin (for a
 * survey) before anything happens.
 *
 * This is the SEAM an internal LLM slots into. A real model implements the same
 * `SmsAnalyser` interface — analyse(messages) → AnalysisResult — and is injected
 * in place of the rule-based default below. The rules exist so the pipeline
 * works, and is testable, before any model is wired, and so a model outage
 * degrades to "no suggestions" rather than a broken feature.
 *
 * Only ever reached for a user who turned smsAnalysisConsent ON; the gate lives
 * in the service, not here, so this stays a pure function of its input.
 */
export interface SmsMessage {
  body: string;
  address: string;
  receivedAt: Date;
}

export interface ProfileSuggestion {
  fieldKey: string;
  suggestedValue: string;
  /** 0–1. Rule matches are modest by design; a real model would calibrate. */
  confidence: number;
  /** A short REASON, never the raw SMS — the text is not retained downstream. */
  evidence: string;
}

export interface SurveySuggestion {
  prompt: string;
  type: string;
  reason: string;
}

export interface AnalysisResult {
  profileSuggestions: ProfileSuggestion[];
  surveySuggestions: SurveySuggestion[];
}

export interface SmsAnalyser {
  analyse(messages: SmsMessage[]): AnalysisResult;
}

/** field, value, the phrases that imply it, a short evidence label, confidence. */
interface Rule {
  fieldKey: string;
  suggestedValue: string;
  patterns: RegExp[];
  evidence: string;
  confidence: number;
}

const RULES: Rule[] = [
  {
    fieldKey: 'has_children', suggestedValue: 'true',
    patterns: [/\bnew baby\b/i, /\bbirth of (your|the)\b/i, /\byour (new )?child\b/i, /\bnewborn\b/i],
    evidence: 'a message about a new baby', confidence: 0.6,
  },
  {
    fieldKey: 'employment_status', suggestedValue: 'employed',
    patterns: [/\boffer you the position\b/i, /\byour start date\b/i, /\bwelcome to the team\b/i, /\bemployment contract\b/i],
    evidence: 'a message about a new job', confidence: 0.55,
  },
  {
    fieldKey: 'vehicle_finance_status', suggestedValue: 'financed',
    patterns: [/\bvehicle finance\b/i, /\bcar loan\b/i, /\b(wesbank|mfc|toyota financial)\b/i],
    evidence: 'a message about vehicle finance', confidence: 0.5,
  },
  {
    fieldKey: 'has_vehicle', suggestedValue: 'true',
    patterns: [/\bvehicle finance\b/i, /\bcar loan\b/i, /\bcar insurance\b/i, /\blicence (disc|renewal)\b/i],
    evidence: 'a message about a vehicle', confidence: 0.45,
  },
  {
    fieldKey: 'has_home_loan', suggestedValue: 'true',
    patterns: [/\bhome loan\b/i, /\bbond (approved|application)\b/i, /\bmortgage\b/i],
    evidence: 'a message about a home loan', confidence: 0.5,
  },
  {
    fieldKey: 'marital_status', suggestedValue: 'married',
    patterns: [/\bwedding\b/i, /\bmarriage certificate\b/i, /\bcongratulations on your marriage\b/i],
    evidence: 'a message about a marriage', confidence: 0.45,
  },
];

/** Recurring themes with no single field — worth ASKING about, not inferring. */
interface SurveyRule {
  patterns: RegExp[];
  prompt: string;
  type: string;
  reason: string;
}

const SURVEY_RULES: SurveyRule[] = [
  {
    patterns: [/\bmedical aid\b/i, /\bdiscovery\b/i, /\bmomentum health\b/i, /\bclaim\b/i],
    prompt: 'How happy are you with your medical aid?',
    type: 'multiple_choice',
    reason: 'medical-aid messages recur but the plan quality is not on the profile',
  },
  {
    patterns: [/\bloan\b/i, /\bcredit\b/i, /\brepayment\b/i, /\barrears\b/i],
    prompt: 'Are you looking for a better rate on any of your loans?',
    type: 'yes_no',
    reason: 'credit messages recur and could match a lender offer',
  },
];

export class RuleBasedSmsAnalyser implements SmsAnalyser {
  analyse(messages: SmsMessage[]): AnalysisResult {
    const bodies = messages.map((m) => m.body ?? '');

    // Profile: strongest evidence per field, no duplicates.
    const byField = new Map<string, ProfileSuggestion>();
    for (const rule of RULES) {
      const hit = bodies.some((b) => rule.patterns.some((p) => p.test(b)));
      if (!hit) continue;
      const existing = byField.get(rule.fieldKey);
      if (!existing || rule.confidence > existing.confidence) {
        byField.set(rule.fieldKey, {
          fieldKey: rule.fieldKey,
          suggestedValue: rule.suggestedValue,
          confidence: rule.confidence,
          evidence: rule.evidence,
        });
      }
    }

    // Surveys: a theme is worth a QUESTION only when it recurs (≥2 messages),
    // so a single stray SMS does not generate a survey idea.
    const surveySuggestions: SurveySuggestion[] = [];
    for (const rule of SURVEY_RULES) {
      const hits = bodies.filter((b) => rule.patterns.some((p) => p.test(b))).length;
      if (hits >= 2) {
        surveySuggestions.push({ prompt: rule.prompt, type: rule.type, reason: rule.reason });
      }
    }

    return { profileSuggestions: [...byField.values()], surveySuggestions };
  }
}
