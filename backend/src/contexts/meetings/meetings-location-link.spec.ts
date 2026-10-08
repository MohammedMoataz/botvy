import { describe, expect, it } from 'vitest';
import {
  isLinkShaped,
  linkUrlOf,
  refusedScheme,
} from './domain/location-link.js';
import { Meeting, MeetingRuleError } from './domain/meeting.aggregate.js';
import type { MeetingLocation } from './domain/recurrence-expander.js';

/**
 * 032, T3210: a link-shaped location is stored only with `http(s)`.
 *
 * The extension renders a location as an `href` and the phone launches it, so
 * the refusal belongs at the write — one place — rather than in every client's
 * escaping.
 */

function schedule(
  location: MeetingLocation,
  overrideLocation?: MeetingLocation,
) {
  const startAt = new Date(Date.now() + 86_400_000);
  return Meeting.schedule({
    id: 'm-1',
    userId: 'u-1',
    title: 'Dentist',
    description: null,
    startAt,
    durationMin: 30,
    lockTimezone: null,
    location,
    prepNotes: null,
    prepMinutes: 0,
    reminderOffsets: [],
    recurrence: overrideLocation
      ? {
          dtstart: startAt,
          rrule: 'FREQ=WEEKLY;COUNT=3',
          exdates: [],
          overrides: [
            {
              originalStart: startAt,
              startAt: new Date(startAt.getTime() + 3_600_000),
              location: overrideLocation,
            },
          ],
        }
      : null,
    source: 'app',
    createdAt: new Date(),
    timezone: 'Africa/Cairo',
  });
}

function codeOf(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof MeetingRuleError) return error.code;
    throw error;
  }
}

// value, link-shaped, refused scheme, the URL a client opens
const CASES: Array<[string, boolean, string | null, string | null]> = [
  [
    'https://maps.app.goo.gl/abc123',
    true,
    null,
    'https://maps.app.goo.gl/abc123',
  ],
  ['http://example.com/room', true, null, 'http://example.com/room'],
  ['HTTPS://Example.com', true, null, 'HTTPS://Example.com'],
  ['www.example.com/x', true, null, 'https://www.example.com/x'],
  ['zoom.us/j/123', true, null, 'https://zoom.us/j/123'],
  ['maps.app.goo.gl/abc', true, null, 'https://maps.app.goo.gl/abc'],
  ['javascript:alert(1)', true, 'javascript', null],
  ['JavaScript:alert(document.cookie)', true, 'javascript', null],
  ['javascript: alert(1)', true, 'javascript', null],
  ['file:///etc/passwd', true, 'file', null],
  ['data:text/html,<b>x</b>', true, 'data', null],
  ['ftp://example.com/a', true, 'ftp', null],
  ['geo:30.04,31.23', true, 'geo', null],
  ['12 Tahrir Square, Cairo', false, null, null],
  ['Office: 3rd floor', false, null, null],
  ['Room 4', false, null, null],
  ['Dr. Ahmed clinic, Zamalek', false, null, null],
];

describe('the link-shape table', () => {
  it.each(CASES)('%s', (value, shaped, scheme, url) => {
    expect(isLinkShaped(value)).toBe(shaped);
    expect(refusedScheme(value)).toBe(scheme);
    expect(linkUrlOf(value)).toBe(url);
  });
});

describe('the aggregate refuses a link with any other scheme', () => {
  it.each(CASES)('%s', (value, _shaped, scheme) => {
    const expected = scheme === null ? null : 'location_link_scheme';
    expect(codeOf(() => schedule({ onlineLink: value, address: null }))).toBe(
      expected,
    );
    expect(codeOf(() => schedule({ onlineLink: null, address: value }))).toBe(
      expected,
    );
  });

  it('on an edit too', () => {
    const meeting = schedule({
      onlineLink: 'https://meet.example/a',
      address: null,
    });
    expect(
      codeOf(() =>
        meeting.edit(
          {
            location: { onlineLink: null, address: 'javascript:alert(1)' },
          },
          'Africa/Cairo',
        ),
      ),
    ).toBe('location_link_scheme');
  });

  it("and on a moved occurrence's room", () => {
    expect(
      codeOf(() =>
        schedule(
          { onlineLink: 'https://meet.example/a', address: null },
          { onlineLink: 'file:///etc/passwd', address: null },
        ),
      ),
    ).toBe('location_link_scheme');
    expect(
      codeOf(() =>
        schedule(
          { onlineLink: 'https://meet.example/a', address: null },
          { onlineLink: null, address: 'www.example.com' },
        ),
      ),
    ).toBeNull();
  });
});
