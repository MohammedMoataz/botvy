import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens the service reported as no longer valid, for the caller to reap. */
  invalidTokens: string[];
}

/** What actually delivers. Injected so the service is specified without Firebase. */
export interface PushTransport {
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}

export class FirebaseCredentialsUnreadable extends Error {
  constructor(path: string, cause: string) {
    super(
      `FIREBASE_CREDENTIALS_FILE is set to ${path} but could not be read at boot: ${cause}. ` +
        'Declaring a credentials file is a declared intent to have push, so the process stops here ' +
        'rather than starting silently unable to notify anyone.',
    );
    this.name = 'FirebaseCredentialsUnreadable';
  }
}

/**
 * Notifications to the phone.
 *
 * Push has two distinct failures and they are treated differently on purpose.
 *
 * At boot, a `FIREBASE_CREDENTIALS_FILE` that is set but unreadable kills the
 * process, named. Declaring a credentials file is a declared intent to have
 * push, and a process that quietly starts without it notifies nobody for as
 * long as nobody looks.
 *
 * A file that was readable at boot and later becomes unreadable — rotated,
 * unmounted, permissions changed — cannot kill a running process without taking
 * every other capability down with it. That reports `pushConfigured: false` and
 * a degraded health status instead.
 *
 * Unset stays unconfigured, and does not degrade anything: an Owner who never
 * set up push has a working system.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  #configured = false;

  constructor(
    private readonly credentialsFile: string | undefined,
    private readonly transport?: PushTransport,
    private readonly readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
  ) {}

  /** Called at boot. Throws when a declared credentials file cannot be read. */
  initialise(): void {
    if (!this.credentialsFile) {
      this.logger.log('No FIREBASE_CREDENTIALS_FILE set; push is disabled.');
      this.#configured = false;
      return;
    }

    try {
      const raw = this.readFile(this.credentialsFile);
      JSON.parse(raw);
      this.#configured = true;
      this.logger.log('Push is configured.');
    } catch (error) {
      throw new FirebaseCredentialsUnreadable(this.credentialsFile, (error as Error).message);
    }
  }

  /**
   * Re-checks the file that was readable at boot. Health calls this; it flips
   * the flag rather than throwing, because a rotated key must not take the rest
   * of the system down with it.
   */
  isConfigured(): boolean {
    if (!this.credentialsFile) return false;
    if (!this.#configured) return false;

    try {
      JSON.parse(this.readFile(this.credentialsFile));
      return true;
    } catch (error) {
      this.logger.error(
        `Firebase credentials at ${this.credentialsFile} became unreadable: ${(error as Error).message}. ` +
          'Push is reported as unconfigured and health is degraded; the process keeps serving everything else.',
      );
      this.#configured = false;
      return false;
    }
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const deliverable = tokens.filter((token) => token.length > 0);
    if (!this.isConfigured() || !this.transport || deliverable.length === 0) {
      return { sent: 0, failed: 0, invalidTokens: [] };
    }

    try {
      return await this.transport.send(deliverable, message);
    } catch (error) {
      // A failed send is recorded, never propagated: the sweep that called this
      // has other members to notify.
      this.logger.warn(`push delivery failed: ${(error as Error).message}`);
      return { sent: 0, failed: deliverable.length, invalidTokens: [] };
    }
  }
}
