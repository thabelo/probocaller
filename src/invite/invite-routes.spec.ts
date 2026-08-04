import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { InviteController } from './invite.controller';
import { AdminInviteController } from '../admin/admin-invite.controller';

/**
 * Two controllers registering the same METHOD + path is not an error in Nest —
 * the first one wins and the other silently never fires. This bit for real:
 * person-to-person invites were first written on `GET admin/invites`, which
 * `AdminInviteController` (invites to become an ADMIN) already owned, so the new
 * endpoint would have returned admin invites forever without a single warning.
 *
 * These two features are permanently adjacent and easy to confuse by name, so
 * pin the separation rather than relying on anyone remembering.
 */
const routesOf = (controller: any): string[] => {
  const proto = controller.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((m) => m !== 'constructor')
    .map((m) => {
      const path = Reflect.getMetadata(PATH_METADATA, proto[m]);
      const method = Reflect.getMetadata(METHOD_METADATA, proto[m]);
      return path === undefined ? null : `${RequestMethod[method]} ${path}`;
    })
    .filter((r): r is string => r !== null);
};

describe('invite route separation', () => {
  it('does not reuse any path already owned by AdminInviteController', () => {
    const mine = routesOf(InviteController);
    const theirs = routesOf(AdminInviteController);
    expect(mine.filter((r) => theirs.includes(r))).toEqual([]);
  });

  it('serves person-to-person invites from their own admin path', () => {
    expect(routesOf(InviteController)).toEqual(
      expect.arrayContaining(['GET admin/user-invites', 'POST invite']),
    );
  });
});
