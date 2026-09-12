import type { ProfileView } from './profile.query.js';

/** Where the member's photo is fetched from. One route, content-negotiated by
 *  the member's own session — the path on the media volume is not a client's
 *  business. */
export const PHOTO_URL = '/api/v1/profile/photo';

/** A profile as a client sees it: the same shape from REST and from GraphQL. */
export type ProfileResponse = Omit<ProfileView, 'photoPath'> & {
  photoUrl?: string;
};

/**
 * The one definition of what a profile looks like on the wire.
 *
 * `photoPath` is where the file sits on the media volume, which is the server's
 * business; a client needs something it can put in an `img` tag. Both edges map
 * it here rather than each doing it, because they were about to disagree: the
 * GraphQL resolver already served `photoUrl` while the four REST responses
 * served `photoPath`, and a store that loaded over one and refreshed over the
 * other would have had a profile whose photo field changed name depending on
 * which call filled it last.
 */
export function toProfileResponse(view: ProfileView): ProfileResponse {
  const { photoPath, ...rest } = view;
  return { ...rest, ...(photoPath ? { photoUrl: PHOTO_URL } : {}) };
}
