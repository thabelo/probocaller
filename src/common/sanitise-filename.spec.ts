import { sanitiseHeaderFilename } from './sanitise-filename';

/**
 * Security regression — Backend H11.
 *
 * FICA's admin download endpoint built `Content-Disposition: inline;
 * filename="${name}"` directly from the user-uploaded `originalName`. A
 * filename like `evil.pdf"; X-Injected: 1\r\n\r\n<html>` produces real header
 * splitting / response injection — letting an attacker control the admin's
 * response headers and inject HTML content into a document download.
 *
 * `sanitiseHeaderFilename` strips/replaces every character that can break out
 * of a quoted header value, caps length, and falls back to "download" for
 * empty input.
 */

describe('sanitiseHeaderFilename — Backend H11 hardening', () => {
  it('strips CR and LF (the actual header-splitting characters)', () => {
    expect(sanitiseHeaderFilename('evil.pdf\r\nX-Injected: 1')).not.toMatch(/[\r\n]/);
  });

  it('replaces double-quote so it cannot terminate the quoted filename param', () => {
    expect(sanitiseHeaderFilename('a"b.pdf')).not.toContain('"');
  });

  it('replaces backslash so it cannot escape inside the quoted filename', () => {
    expect(sanitiseHeaderFilename('a\\b.pdf')).not.toContain('\\');
  });

  it('strips path components — only the basename survives', () => {
    expect(sanitiseHeaderFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseHeaderFilename('/abs/path/file.txt')).toBe('file.txt');
    expect(sanitiseHeaderFilename('subdir\\evil.exe')).toBe('evil.exe');
  });

  it('caps to a reasonable length to avoid header bloat', () => {
    const huge = 'a'.repeat(500) + '.pdf';
    expect(sanitiseHeaderFilename(huge).length).toBeLessThanOrEqual(200);
  });

  it('falls back to "download" for empty / whitespace / null', () => {
    expect(sanitiseHeaderFilename('')).toBe('download');
    expect(sanitiseHeaderFilename('   ')).toBe('download');
    expect(sanitiseHeaderFilename(null as any)).toBe('download');
    expect(sanitiseHeaderFilename(undefined as any)).toBe('download');
  });

  it('preserves benign filenames untouched', () => {
    expect(sanitiseHeaderFilename('proof_of_address.pdf')).toBe('proof_of_address.pdf');
    expect(sanitiseHeaderFilename('selfie 2025.jpg')).toBe('selfie 2025.jpg');
  });

  it('output is safe to interpolate into Content-Disposition (no CRLF, quote, backslash, control chars)', () => {
    const dirty = 'a"b\\c\r\nd\x00e.pdf';
    const clean = sanitiseHeaderFilename(dirty);
    expect(clean).not.toMatch(/["\\\r\n\x00-\x1f]/);
  });
});
