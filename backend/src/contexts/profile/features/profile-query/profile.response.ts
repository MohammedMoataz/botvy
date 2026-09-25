import type { ProfileView } from './profile.query.js';

/** A profile as a client sees it: the same shape from REST and from GraphQL. */
export type ProfileResponse = Omit<ProfileView, 'photoPath'>;

/**
 * The one definition of what a profile looks like on the wire.
 *
 * `photoPath` is where the file sits, which is the server's business; a client
 * needs something it can put in an `img` tag, and that is `photoUrl`, minted
 * by the store that holds the bytes — a signed route on this API for the
 * filesystem provider, whatever an object store mints for that one. Both edges
 * map it here rather than each doing it, because they were about to disagree:
 * the GraphQL resolver already served `photoUrl` while the four REST responses
 * served `photoPath`, and a store that loaded over one and refreshed over the
 * other would have had a profile whose photo field changed name depending on
 * which call filled it last.
 */
export function toProfileResponse(view: ProfileView): ProfileResponse {
  const { photoPath: _serverSide, ...rest } = view;
  return rest;
}
