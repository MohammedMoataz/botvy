import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddressLine, PreviewBody } from '../entrypoints/sidepanel/Meetings';
import { fetchLinkPreview, osmLink, safeHref } from '../lib/meeting-links';

/**
 * 032, T3212 and T3231: a link-shaped address is an `<a>` with an http(s)
 * `href` and nothing else, and the preview card shows what the server said.
 * Rendered to static markup, because the suite runs in node.
 */

describe('safeHref', () => {
  it.each([
    ['https://maps.app.goo.gl/abc', 'https://maps.app.goo.gl/abc'],
    ['www.example.com/x', 'https://www.example.com/x'],
    ['zoom.us/j/1', 'https://zoom.us/j/1'],
    ['javascript:alert(1)', null],
    ['JavaScript: alert(1)', null],
    ['data:text/html,x', null],
    ['12 Tahrir Square, Cairo', null],
    ['Office: 3rd floor', null],
  ])('%s', (value, expected) => {
    expect(safeHref(value)).toBe(expected);
  });
});

describe('AddressLine', () => {
  const html = (address: string) =>
    renderToStaticMarkup(createElement(AddressLine, { address }));

  it('renders a place link as a link', () => {
    expect(html('maps.app.goo.gl/abc')).toContain(
      'href="https://maps.app.goo.gl/abc"',
    );
  });

  it('renders a plain address as text', () => {
    expect(html('12 Tahrir Square')).not.toContain('<a');
  });

  it('never renders a javascript: address as a link', () => {
    const markup = html('javascript:alert(1)');
    expect(markup).not.toContain('<a');
    expect(markup).not.toContain('href');
  });
});

describe('the preview card', () => {
  it('shows the site, the title and a map link for a place', () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewBody, {
        preview: {
          title: 'Dentist',
          siteName: 'Google Maps',
          image: 'https://example.com/a.png',
          place: { lat: 30.04, lng: 31.23 },
        },
        viewOnMap: 'View on map',
      }),
    );
    expect(markup).toContain('Dentist');
    expect(markup).toContain('Google Maps');
    expect(markup).toContain('src="https://example.com/a.png"');
    expect(markup).toContain(
      `href="${osmLink(30.04, 31.23).replace(/&/g, '&amp;')}"`,
    );
  });

  it('is nothing for an empty preview', () => {
    expect(
      renderToStaticMarkup(
        createElement(PreviewBody, {
          preview: { title: null, siteName: null, image: null, place: null },
          viewOnMap: 'x',
        }),
      ),
    ).toBe('');
  });

  it('asks the server and drops an unsafe image', async () => {
    const asked: unknown[] = [];
    const client = {
      async query<T>(_document: string, variables?: Record<string, unknown>) {
        asked.push(variables);
        return {
          linkPreview: {
            title: 'T',
            siteName: null,
            image: 'javascript:alert(1)',
            place: null,
          },
        } as T;
      },
    };
    const preview = await fetchLinkPreview(client, { address: 'Tahrir' });
    expect(asked).toEqual([{ url: null, address: 'Tahrir' }]);
    expect(preview?.image).toBeNull();
  });

  it('answers null when offline', async () => {
    const client = {
      async query<T>(): Promise<T> {
        throw new Error('offline');
      },
    };
    expect(await fetchLinkPreview(client, { url: 'https://x.y' })).toBeNull();
  });
});
