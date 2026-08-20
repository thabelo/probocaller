/**
 * Strip the obvious identifiers out of a written answer before a business ever
 * reads it.
 *
 * The prompt screen stops a business ASKING who someone is. This catches the
 * respondent VOLUNTEERING it — "just call me on 082…" in a box that asked what
 * would have improved their visit. People do that, and the promise made to
 * them does not have an exception for it.
 *
 * DELIBERATELY CONSERVATIVE, and deliberately not the last line of defence. It
 * cannot catch someone describing themselves in prose ("I was the only person
 * in a wheelchair at the Kroonstad clinic on Tuesday"), and no pattern set
 * ever will. What it does catch is the mechanical stuff — numbers and
 * addresses that are trivially re-identifying and trivially matched. The rest
 * is handled by never releasing verbatims until the survey closes, never
 * keying them to a response, and shuffling them so two answers cannot be read
 * as one person.
 *
 * Small numbers are left alone on purpose: "I waited about 25 minutes" is the
 * answer the business paid for, and a rule that ate it would make the feature
 * worthless to protect nothing.
 */
const REDACTIONS: RegExp[] = [
  // Email, first — before digit rules can chew through the local part.
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // International or spaced phone numbers: +27 82 123 4567, 082 123 4567.
  /\+?\d[\d\s().-]{8,}\d/g,
  // Any unbroken run of 7+ digits — phone, ID, account, policy.
  /\d{7,}/g,
];

export const REDACTED = '[removed]';

export function redactFreeText(text: string): { text: string; redacted: boolean } {
  if (!text) return { text: '', redacted: false };

  let out = text;
  for (const pattern of REDACTIONS) out = out.replace(pattern, REDACTED);

  // Nothing matched: hand back exactly what was written. Tidying whitespace
  // here would report an answer as redacted when nothing was taken out of it,
  // and `redacted` is what the business is told about what it is reading.
  if (out === text) return { text, redacted: false };

  // Collapse "[removed] [removed]" left by two rules hitting one identifier,
  // so a single phone number does not read as two withheld things.
  out = out.replace(/(?:\[removed\]\s*){2,}/g, `${REDACTED} `).trim();

  return { text: out, redacted: true };
}
