import { extensionForMime } from './mime-extension';

/**
 * Backend M11 — the FICA/KYB upload code derived the on-disk extension from
 * `file.originalname` via `path.extname(...)`. `originalname` is user-
 * controlled, so an attacker could upload `evil.svg.pdf.exe` and have the
 * file saved with `.exe` on disk. The mime type is already whitelisted at
 * the controller boundary, so deriving the extension from the mime is both
 * safer and simpler.
 */

describe('extensionForMime — Backend M11', () => {
  it.each([
    ['application/pdf',  '.pdf'],
    ['image/jpeg',       '.jpg'],
    ['image/jpg',        '.jpg'],
    ['image/png',        '.png'],
  ])('maps %s → %s', (mime, expected) => {
    expect(extensionForMime(mime)).toBe(expected);
  });

  it('returns ".bin" for unknown mime types (caller should reject before reaching here)', () => {
    expect(extensionForMime('application/octet-stream')).toBe('.bin');
    expect(extensionForMime('image/svg+xml')).toBe('.bin');
    expect(extensionForMime('text/html')).toBe('.bin');
  });

  it('is case-insensitive', () => {
    expect(extensionForMime('APPLICATION/PDF')).toBe('.pdf');
    expect(extensionForMime('Image/PNG')).toBe('.png');
  });

  it('returns ".bin" for empty / null', () => {
    expect(extensionForMime('')).toBe('.bin');
    expect(extensionForMime(null as any)).toBe('.bin');
    expect(extensionForMime(undefined as any)).toBe('.bin');
  });
});
