// UserModule validates required config the moment it is imported, so these are
// set before the require() calls inside the tests rather than at import time.
process.env.JWT_SECRET ||= 'test-secret-that-is-long-enough-to-pass-validation';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-long-enough-to-pass-too';
process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '5432';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';

const { UserModule } = require('./user.module');
const { AvatarService } = require('./avatar.service');
const { AvatarController } = require('./avatar.controller');

/**
 * The module must actually REGISTER the avatar endpoints.
 *
 * Learned the hard way this session: ReferralService was given a repository its
 * module never supplied, every unit test passed because they construct the
 * service by hand, and the API refused to boot. Forgetting to register is the
 * same class of mistake and equally invisible to the unit tests above.
 *
 * This asserts the wiring DECLARATION rather than compiling the whole DI graph
 * — UserModule drags in most of the app's infrastructure, and standing all of
 * it up would test Nest more than it tests us. The full-boot check is the
 * deploy itself, which restarts the API and fails loudly.
 */
describe('UserModule — profile photo wiring', () => {
  it('registers the avatar controller so the routes exist', () => {
    const controllers = Reflect.getMetadata('controllers', UserModule) ?? [];
    expect(controllers).toContain(AvatarController);
  });

  it('provides the avatar service the controller depends on', () => {
    const providers = Reflect.getMetadata('providers', UserModule) ?? [];
    expect(providers).toContain(AvatarService);
  });
});
