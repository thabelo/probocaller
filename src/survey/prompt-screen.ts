import { BadRequestException } from '@nestjs/common';

/**
 * Refuse a survey question that asks a respondent who they are.
 *
 * Everything else in the results pipeline protects answer VALUES — counts are
 * suppressed, cohorts are batched, verbatims are redacted. None of it helps if
 * the business simply asks "What is your cell number?" as a free-text question
 * and reads the answer back. Suppression defends the reporting; this defends
 * the COLLECTING, and it is the only one of the two that stops the data
 * existing in the first place.
 *
 * Screened at every write path and again at publish, because a question
 * written before this shipped would otherwise sail through.
 *
 * THE PATTERNS ARE DELIBERATELY NARROW. A naive /name/ would reject "What is
 * the name of the branch you visited?" and /email/ would reject "Do you prefer
 * email or SMS?" — both perfectly ordinary questions, and every false
 * rejection is a business being told it may not ask something reasonable. So
 * these match the way someone actually asks for an identity: possessively
 * ("your name"), by qualifier ("full name", "ID number"), or as a bare label
 * ("Surname"). The residue is handled by the redaction pass on the way out and
 * by the terms a business agrees to — this is a first line, not the only one.
 */
const IDENTITY_PATTERNS: RegExp[] = [
  // Possessive: the way a form asks. "your name", "your full name", "jou naam".
  /\byour\s+(full\s+|first\s+|last\s+|legal\s+|real\s+)?name\b/i,
  /\bjou\s+(volle\s+)?naam\b/i,
  // Qualified: "full name", "first name", "maiden name" — never a branch.
  /\b(full|first|last|legal|maiden|middle)\s+names?\b/i,
  /\bsurname\b/i,
  // A bare label. "Name:" on its own is a form field, not a question about a
  // brand or a branch — but only when it IS the whole prompt.
  /^\s*(your\s+)?names?\s*[:?]?\s*$/i,
  // Government identifiers. 'nommer' because the platform is RSA-first and an
  // Afrikaans prompt must not walk straight past an English-only screen.
  /\b(id|identity|identiteits?)\s*(number|no\.?|nommer)\b/i,
  /\bid\s*nommer\b/i,
  /\bpassport\b/i,
  // Reachable-on: a number or handle that rings a specific handset.
  /\b(cell|cellphone|mobile|phone|contact|telephone|tel|whatsapp)\s*(number|no\.?|nommer)\b/i,
  /\bwhatsapp\b/i,
  // Email. Not bare /email/ — "email or SMS?" is a real question.
  /\byour\s+e-?mail\b/i,
  /\be-?mail\s*address\b/i,
  /^\s*e-?mail\s*[:?]?\s*$/i,
  // Where someone lives. Not bare /address/ — "how many live at your address"
  // is a household-size question and is caught by none of these.
  /\b(physical|home|street|postal|residential|delivery)\s*address\b/i,
  // Only when the prompt is ASKING for it. "How many people live at your
  // address?" is a household-size question and must survive this screen.
  /\b(what|which|give|enter|provide|share|state|type|confirm)\b[^?]*\byour\s+address\b/i,
  // Financial identifiers.
  /\b(account|policy|card|reference)\s*(number|no\.?|nommer)\b/i,
];

export const IDENTITY_PROMPT_MESSAGE =
  'A survey question may not ask for anything that identifies someone — no name, ' +
  'number, ID, email, address or account number. Answers are anonymous, and that ' +
  'is what respondents were promised. Ask about what people did or think instead, ' +
  'or use Audience & Leads if you need to reach named people.';

export function promptCollectsIdentity(prompt: string): boolean {
  if (!prompt?.trim()) return false; // "a question needs a prompt" is a different rule
  return IDENTITY_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function assertPromptCollectsNoIdentity(prompt: string): void {
  if (promptCollectsIdentity(prompt)) {
    throw new BadRequestException(IDENTITY_PROMPT_MESSAGE);
  }
}
