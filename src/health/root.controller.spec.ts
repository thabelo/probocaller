import { RootController } from './root.controller';

/**
 * What the bare domain says.
 *
 * The API had no route at `/`, so opening probocaller.proboit.co.za in a
 * browser returned {"message":"Cannot GET /"} — indistinguishable from an
 * outage to anyone who isn't reading status codes. This makes the root
 * self-describing without publishing the API surface: no route list, no
 * schemas, just enough to show the service is alive and point a human at the
 * console.
 */
describe('RootController', () => {
  const controller = new RootController();

  it('identifies the service rather than looking like a 404', () => {
    const body = controller.index();

    expect(body.service).toMatch(/probocaller/i);
    expect(body.status).toBe('ok');
  });

  it('points a human at the console, since this host serves no UI', () => {
    expect(controller.index().console).toMatch(/^https:\/\/probocaller-admin\./);
  });

  it('points a machine at the health check', () => {
    expect(controller.index().health).toBe('/health');
  });

  /**
   * The root is unauthenticated, so it must not become a map of the API. The
   * docs UI is deliberately withheld in production; listing routes here would
   * hand over the same information by another door.
   */
  it('does not enumerate the API surface', () => {
    const body: Record<string, unknown> = controller.index();

    expect(Object.keys(body)).toEqual(
      expect.not.arrayContaining(['routes', 'endpoints', 'paths']),
    );
    expect(JSON.stringify(body)).not.toMatch(/\/marketplace|\/admin|\/auth/);
  });
});
