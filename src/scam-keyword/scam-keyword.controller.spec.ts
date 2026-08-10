import 'reflect-metadata';
import { AuthGuard } from '@nestjs/passport';
import { ScamKeywordController } from './scam-keyword.controller';

/**
 * Device-sync endpoint: mobile calls this to merge the global admin-managed
 * scam list with its own hardcoded defaults and the user's per-user
 * BlockedKeyword list. The response shape is a hard contract another agent
 * is building the mobile side against right now — do not change it without
 * flagging: { keywords: string[] }.
 */
describe('ScamKeywordController (device sync)', () => {
  let controller: ScamKeywordController;
  let service: any;

  beforeEach(() => {
    service = { getActiveKeywords: jest.fn() };
    controller = new ScamKeywordController(service);
  });

  it('requires JWT auth (mirrors BlockedKeywordController, not admin-only)', () => {
    const guards = Reflect.getMetadata('__guards__', ScamKeywordController) ?? [];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(AuthGuard('jwt'));
  });

  it('returns only active keywords in the { keywords: string[] } shape', async () => {
    service.getActiveKeywords.mockResolvedValue(['free bitcoin', 'lottery winner']);

    const result = await controller.sync();

    expect(service.getActiveKeywords).toHaveBeenCalled();
    expect(result).toEqual({ keywords: ['free bitcoin', 'lottery winner'] });
  });
});
