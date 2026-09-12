import { describe, expect, it } from 'vitest';
import {
  FirebaseCredentialsUnreadable,
  PushService,
  type PushMessage,
  type PushResult,
  type PushTransport,
} from './push.service.js';

const GOOD = JSON.stringify({ project_id: 'botvy', client_email: 'x@y.z' });

function reader(behaviour: () => string): (path: string) => string {
  return () => behaviour();
}

const okTransport: PushTransport = {
  async send(tokens): Promise<PushResult> {
    return { sent: tokens.length, failed: 0, invalidTokens: [] };
  },
};

const message: PushMessage = { title: 'Plan tomorrow', body: 'What does tomorrow look like?' };

/**
 * v1 shipped no spec for push, so this is written here rather than ported. The
 * three cases below are the whole of its contract, and they differ from each
 * other in ways that matter.
 */
describe('push configuration', () => {
  it('is unconfigured, and harmless, when no credentials file is named', () => {
    const push = new PushService(undefined, okTransport, reader(() => GOOD));

    expect(() => push.initialise()).not.toThrow();
    expect(push.isConfigured()).toBe(false);
  });

  /**
   * Declaring a credentials file is a declared intent to have push. A process
   * that starts quietly without it notifies nobody for as long as nobody looks.
   */
  it('refuses to start when a declared credentials file cannot be read at boot', () => {
    const push = new PushService(
      '/secrets/firebase.json',
      okTransport,
      reader(() => {
        throw new Error('ENOENT');
      }),
    );

    expect(() => push.initialise()).toThrow(FirebaseCredentialsUnreadable);
    expect(() => push.initialise()).toThrow(/\/secrets\/firebase\.json/);
  });

  it('refuses to start when the credentials file is not valid JSON', () => {
    const push = new PushService('/secrets/firebase.json', okTransport, reader(() => 'not json'));

    expect(() => push.initialise()).toThrow(FirebaseCredentialsUnreadable);
  });

  it('is configured when the file reads', () => {
    const push = new PushService('/secrets/firebase.json', okTransport, reader(() => GOOD));
    push.initialise();

    expect(push.isConfigured()).toBe(true);
  });

  /**
   * The other half of the rule: a key rotated or unmounted under a running
   * process cannot take every other capability down with it.
   */
  it('flips to unconfigured instead of throwing when the file goes away later', () => {
    let readable = true;
    const push = new PushService(
      '/secrets/firebase.json',
      okTransport,
      reader(() => {
        if (!readable) throw new Error('EACCES');
        return GOOD;
      }),
    );

    push.initialise();
    expect(push.isConfigured()).toBe(true);

    readable = false;
    expect(() => push.isConfigured()).not.toThrow();
    expect(push.isConfigured()).toBe(false);
  });
});

describe('push delivery', () => {
  it('delivers to the tokens it was given', async () => {
    const push = new PushService('/secrets/firebase.json', okTransport, reader(() => GOOD));
    push.initialise();

    expect(await push.send(['t1', 't2'], message)).toMatchObject({ sent: 2, failed: 0 });
  });

  it('sends nothing when push is not configured', async () => {
    const push = new PushService(undefined, okTransport, reader(() => GOOD));
    push.initialise();

    expect(await push.send(['t1'], message)).toEqual({ sent: 0, failed: 0, invalidTokens: [] });
  });

  it('sends nothing when there are no tokens, rather than calling the transport', async () => {
    let called = false;
    const transport: PushTransport = {
      async send() {
        called = true;
        return { sent: 0, failed: 0, invalidTokens: [] };
      },
    };
    const push = new PushService('/secrets/firebase.json', transport, reader(() => GOOD));
    push.initialise();

    await push.send([], message);
    expect(called).toBe(false);
  });

  /** The sweep that called this has other members to notify. */
  it('records a failed delivery rather than propagating it', async () => {
    const failing: PushTransport = {
      async send() {
        throw new Error('FCM unavailable');
      },
    };
    const push = new PushService('/secrets/firebase.json', failing, reader(() => GOOD));
    push.initialise();

    expect(await push.send(['t1'], message)).toMatchObject({ sent: 0, failed: 1 });
  });

  it('reports tokens the service rejected, so the caller can reap them', async () => {
    const reaping: PushTransport = {
      async send(tokens) {
        return { sent: tokens.length - 1, failed: 1, invalidTokens: [tokens[0]!] };
      },
    };
    const push = new PushService('/secrets/firebase.json', reaping, reader(() => GOOD));
    push.initialise();

    expect(await push.send(['dead', 'alive'], message)).toMatchObject({
      invalidTokens: ['dead'],
    });
  });
});
