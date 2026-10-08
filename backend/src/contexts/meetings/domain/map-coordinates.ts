/**
 * Coordinates a map link carries in itself (032, FR-004).
 *
 * Reading them from the URL costs nothing and asks nobody, so it is tried
 * before any geocoder. Most specific first: Google's `!3d…!4d…` is the place,
 * where its `@lat,lng` is only where the viewport was centred.
 */
const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

type Extractor = (url: string) => [string, string] | null;

function pair(pattern: string, flags = ''): Extractor {
  const re = new RegExp(pattern, flags);
  return (url) => {
    const match = re.exec(url);
    return match ? [match[1]!, match[2]!] : null;
  };
}

const EXTRACTORS: Extractor[] = [
  pair(String.raw`!3d${NUM}!4d${NUM}`),
  pair(
    String.raw`[?&](?:q|ll|query|center|destination|daddr)=(?:loc:)?${NUM},\s*\+?${NUM}(?:[&#]|$)`,
  ),
  pair(String.raw`@${NUM},${NUM}`),
  // OpenStreetMap's marker, whose two halves may come in either order.
  (url) => {
    const lat = new RegExp(String.raw`[?&]mlat=${NUM}`).exec(url);
    const lng = new RegExp(String.raw`[?&]mlon=${NUM}`).exec(url);
    return lat && lng ? [lat[1]!, lng[1]!] : null;
  },
  pair(String.raw`#map=\d{1,2}/${NUM}/${NUM}`),
  pair(String.raw`^geo:${NUM},${NUM}`, 'i'),
];

export function coordinatesFrom(
  raw: string,
): { lat: number; lng: number } | null {
  let url = raw;
  // A consent page carries the map URL percent-encoded in `continue=`.
  try {
    url = decodeURIComponent(raw);
  } catch {
    // Malformed escapes: read it as written.
  }

  for (const extract of EXTRACTORS) {
    const found = extract(url);
    if (!found) continue;
    const lat = Number(found[0]);
    const lng = Number(found[1]);
    // `0,0` is the `geo:0,0?q=` of a search, not a place in the Gulf of Guinea.
    if (lat === 0 && lng === 0) continue;
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}
