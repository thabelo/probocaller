// TDD GREEN for src/common/sanitise-filename.spec.ts (RED before this file
// existed). User authorised the Tier-1 batch in the prior turn.
//
// Backend H11 fix — the FICA download endpoint built
// `Content-Disposition: inline; filename="${name}"` from the user-uploaded
// originalName. A filename like `evil.pdf"; X-Injected: 1\r\n\r\n<html>`
// would break out of the quoted filename param and inject arbitrary response
// headers / body when an admin opens the download. This helper produces a
// filename that is always safe to interpolate into a quoted header value.
const MAX_LEN = 200;

export function sanitiseHeaderFilename(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return 'download';
  let name = String(raw);

  // Strip any path components — only the basename survives. Covers both
  // POSIX (`/`) and Windows-style (`\`) separators.
  const lastSep = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  if (lastSep >= 0) name = name.slice(lastSep + 1);

  // Remove characters that can break out of a quoted Content-Disposition
  // filename param or split headers: CR, LF, NUL/control chars, double-quote,
  // backslash. We replace with `_` so adjacent characters don't accidentally
  // form a new path or extension.
  name = name.replace(/[\x00-\x1f"\\]/g, '_');

  name = name.trim();
  if (!name) return 'download';

  if (name.length > MAX_LEN) name = name.slice(0, MAX_LEN);
  return name;
}
