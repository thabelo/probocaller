// TDD GREEN for mime-extension.spec.ts. User authorised the MEDIUM/LOW sweep.
//
// Backend M11 — derive the on-disk file extension from the validated mime
// type, NOT from the user-supplied `originalname`. The mime allowlist lives
// at the controller boundary (FICA + KYB), so by the time we get here the
// mime is one of the safe ones. Unknown mimes fall back to `.bin` rather
// than risking a misleading extension that the OS or a browser might
// interpret.
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg':      '.jpg',
  'image/jpg':       '.jpg',
  'image/png':       '.png',
};

export function extensionForMime(mime: string | null | undefined): string {
  if (!mime) return '.bin';
  return MIME_TO_EXT[String(mime).toLowerCase()] ?? '.bin';
}
