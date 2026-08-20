import 'reflect-metadata';

/**
 * A feature module that is never imported by AppModule is dead code with green
 * tests: its controllers serve no routes and its providers are never
 * instantiated, while every one of its own unit tests keeps passing. This
 * asserts the survey module is actually mounted.
 *
 * app.module.ts evaluates requireEnv() for the whole TypeORM config at IMPORT
 * time, so it must be require()d after these are set — the same dance
 * user.module.spec.ts documents.
 */
describe('AppModule wiring', () => {
  const REQUIRED_KEYS = ['JWT_SECRET', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const originals: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of REQUIRED_KEYS) originals[key] = process.env[key];
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      process.env.JWT_SECRET = 'a'.repeat(64);
    }
    process.env.DB_HOST ||= 'localhost';
    process.env.DB_PORT ||= '5432';
    process.env.DB_USER ||= 'test';
    process.env.DB_PASSWORD ||= 'test';
    process.env.DB_NAME ||= 'test';
  });

  afterAll(() => {
    for (const key of REQUIRED_KEYS) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  });

  it('mounts SurveyModule, so its admin routes actually exist', () => {
    const { AppModule } = require('./app.module');
    const { SurveyModule } = require('./survey/survey.module');

    const imports = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(SurveyModule);
  });
  /**
   * The shipped survey templates are seeded at boot, the same way the app
   * catalogue and the profile fields are: a deploy is what puts new ones in
   * front of businesses, without an admin having to retype them.
   */
  it('seeds the shipped survey templates at boot', async () => {
    const { AppModule } = require('./app.module');

    const migrationService = { run: jest.fn() };
    const adminService = { seedDefaultConfig: jest.fn() };
    const profileService = { seedDefaultFields: jest.fn() };
    const templateService = { seedDefaultTemplates: jest.fn().mockResolvedValue(120) };

    const app = new AppModule(
      migrationService as any, adminService as any, profileService as any, templateService as any,
    );
    await app.onModuleInit();

    expect(templateService.seedDefaultTemplates).toHaveBeenCalled();
  });
});
