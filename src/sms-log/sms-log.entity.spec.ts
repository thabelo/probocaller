import { SmsLog } from './sms-log.entity';

/**
 * Per-user SMS activity log. Every time a device evaluates an incoming SMS
 * against the user's SMS policy (or blocks it via keyword matching), it
 * uploads one log entry per message for admin visibility. The actual SMS
 * text must NEVER reach the server — only an MD5 hash of the body.
 */
describe('SmsLog entity', () => {
  it('never carries the SMS message body or text — only an opaque hash', () => {
    const log = new SmsLog();
    expect(log).not.toHaveProperty('body');
    expect(log).not.toHaveProperty('message');
    expect(log).not.toHaveProperty('text');
  });
});
