import { getMetadataArgsStorage } from 'typeorm';
import { App } from './app.entity';

/**
 * The app catalogue. Rows are admin-managed, so launching an app is a data
 * change rather than a release.
 *
 * `key` is the contract between the catalogue and the code: guards, the client
 * manifest and the install rows all reference apps by it, and `app_installs`
 * stores it as a plain string rather than an FK. A duplicate key would make
 * "which app is this?" ambiguous everywhere at once, so the database — not
 * admin discipline — has to be what prevents it.
 */
describe('App entity', () => {
  const keyColumn = () =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === App && c.propertyName === 'key',
    );

  it('enforces a unique app key in the database', () => {
    expect(keyColumn()?.options?.unique).toBe(true);
  });
});
