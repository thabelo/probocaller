import { redactFreeText } from './free-text-redaction';

const out = (text: string) => redactFreeText(text).text;

describe('redactFreeText', () => {
  it('removes a phone number from a written answer', () => {
    expect(out('Call me on 0821234567 and I will explain')).toBe(
      'Call me on [removed] and I will explain',
    );
  });

  it('removes an international phone number', () => {
    expect(out('reach me at +27 82 123 4567')).toMatch(/\[removed\]/);
    expect(out('reach me at +27 82 123 4567')).not.toMatch(/\d{3}/);
  });

  it('removes an email address', () => {
    expect(out('mail thabo@example.co.za please')).toBe('mail [removed] please');
  });

  it('removes a long digit run that could be an ID number', () => {
    expect(out('my id is 8801015009087')).toBe('my id is [removed]');
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'The queue was too long and nobody greeted me at the door.';
    expect(out(prose)).toBe(prose);
  });

  it('leaves small numbers alone, because they are the answer', () => {
    const answer = 'I waited about 25 minutes, maybe 30.';
    expect(out(answer)).toBe(answer);
  });

  it('marks an answer as redacted only when something changed', () => {
    expect(redactFreeText('nothing to see here').redacted).toBe(false);
    expect(redactFreeText('ring 0821234567').redacted).toBe(true);
  });

  it('handles an empty or missing answer', () => {
    expect(redactFreeText('')).toEqual({ text: '', redacted: false });
    expect(redactFreeText(null as any)).toEqual({ text: '', redacted: false });
  });

  it('removes several identifiers in one answer', () => {
    const { text, redacted } = redactFreeText('call 0821234567 or mail me at a@b.com');
    expect(redacted).toBe(true);
    expect(text).toBe('call [removed] or mail me at [removed]');
  });

  /**
   * `redacted` drives what the business is told about the answer it is
   * reading. Marking a merely-padded answer as redacted would claim something
   * was withheld when nothing was.
   */
  it('does not call an answer redacted just for having whitespace round it', () => {
    expect(redactFreeText('  the queue was long  ').redacted).toBe(false);
  });
});
