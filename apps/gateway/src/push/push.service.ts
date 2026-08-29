import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PushMessage {
  title: string;
  body: string;
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
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: {
    sendEachForMulticast: (msg: unknown) => Promise<{
      responses: { success: boolean; error?: { code: string } }[];
    }>;
  } | null = null;
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

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

    try {
      // Subpath exports, not the `firebase-admin` namespace: under
      // nodenext the namespace's members sit behind `.default` and don't
      // type-resolve.
      const { getApps, initializeApp, cert } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');

      if (getApps().length === 0) {
        initializeApp({ credential: cert(credentialsPath) });
      }
      this.messaging = getMessaging() as unknown as typeof this.messaging;
      this.logger.log('Firebase Cloud Messaging initialised');
    } catch (err) {
      this.logger.error(`Failed to initialise FCM, push disabled: ${String(err)}`);
    }
  }

  get isConfigured(): boolean {
    return this.messaging !== null;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    await this.ensureInit();
    if (tokens.length === 0) return { delivered: 0, invalidTokens: [] };

    if (!this.messaging) {
      this.logger.log(
        `[push disabled] would send "${message.title}" to ${tokens.length} device(s)`,
      );
      return { delivered: 0, invalidTokens: [] };
    }

    const response = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
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
