import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';

export interface PushMessage {
  /** Omit title and body for a data-only message: the phone reacts, the user sees nothing. */
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

export interface PushResult {
  delivered: number;
  /** Tokens the provider reported as permanently invalid — callers delete these device rows. */
  invalidTokens: string[];
}

/**
 * Firebase Cloud Messaging sender.
 *
 * FCM is optional at runtime: a fresh install has no Firebase project, and
 * the whole reminder flow must still run end to end (rows marked, no crash)
 * so the system is demonstrable before that exists. When unconfigured this
 * logs what it would have sent and reports zero deliveries.
 *
 * Setting FIREBASE_CREDENTIALS_FILE declares the intent to have push, so a
 * value that does not resolve is a boot failure rather than a warning: the
 * previous lazy catch-and-log let a host path handed to a Linux container
 * disable every notification silently for days.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: {
    sendEachForMulticast: (msg: unknown) => Promise<{
      responses: { success: boolean; error?: { code: string } }[];
    }>;
  } | null = null;
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInit();
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const credentialsPath = this.config.get<string>('FIREBASE_CREDENTIALS_FILE');
    if (!credentialsPath) {
      this.logger.warn(
        'FIREBASE_CREDENTIALS_FILE not set — push notifications are disabled. ' +
          'Reminder sweeps will still run and mark rows, but nothing is delivered.',
      );
      return;
    }

    if (!existsSync(credentialsPath)) {
      throw new Error(
        `FIREBASE_CREDENTIALS_FILE points at "${credentialsPath}", which does not exist. ` +
          'It must be a path this process can read — inside Docker that means the path the ' +
          'key is mounted at (FIREBASE_CREDENTIALS_DIR mounts the host directory to ' +
          '/run/secrets, so use /run/secrets/<file>.json), not a host path. ' +
          'Unset it to run deliberately without push.',
      );
    }

    // Subpath exports, not the `firebase-admin` namespace: under
    // nodenext the namespace's members sit behind `.default` and don't
    // type-resolve.
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');

    if (getApps().length === 0) {
      initializeApp({ credential: cert(credentialsPath) });
    }
    this.messaging = getMessaging() as unknown as typeof this.messaging;
    this.logger.log(`Firebase Cloud Messaging initialised from ${credentialsPath}`);
  }

  get isConfigured(): boolean {
    return this.messaging !== null;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    await this.ensureInit();
    if (tokens.length === 0) return { delivered: 0, invalidTokens: [] };

    if (!this.messaging) {
      this.logger.log(
        `[push disabled] would send "${message.title ?? message.data?.type ?? 'data'}" to ${
          tokens.length
        } device(s)`,
      );
      return { delivered: 0, invalidTokens: [] };
    }

    const visible = message.title !== undefined || message.body !== undefined;
    const response = await this.messaging.sendEachForMulticast({
      tokens,
      // A data-only message carries no notification block at all, or the OS
      // draws a banner for what is meant to be a silent sync.
      ...(visible
        ? { notification: { title: message.title, body: message.body } }
        : {
            android: { priority: 'high' },
            apns: { payload: { aps: { 'content-available': 1 } } },
          }),
      data: message.data,
    });

    const invalidTokens: string[] = [];
    let delivered = 0;
    response.responses.forEach((r, i) => {
      if (r.success) {
        delivered += 1;
        return;
      }
      // These two codes mean the token will never work again; anything
      // else (network, quota) is transient and worth retrying.
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[i]);
      }
    });

    return { delivered, invalidTokens };
  }
}
