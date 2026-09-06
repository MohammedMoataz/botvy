import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../cqrs/domain-event.js';

export interface WebhookSubscription {
  event: string;
  url: string;
  enabled: boolean;
}

export interface DeliveryOutcome {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Injected so the fanout can be specified without a network. */
export type HttpPost = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number }>;

export const HTTP_POST = Symbol('HTTP_POST');

export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/**
 * Delivers a domain event to whichever automation subscriptions match it.
 *
 * Every delivery carries `X-Botvy-Event-Id`, and that is load-bearing rather
 * than decorative: delivery is at-least-once by design, so a parked-then-resumed
 * subscription and a retried webhook both arrive twice. The subscriber is what
 * makes the effect happen once, by discarding an id it has already seen. The
 * relay never promised exactly-once and must not be read as if it had.
 */
@Injectable()
export class WebhookFanout {
  constructor(
    private readonly secret: string,
    private readonly post: HttpPost,
  ) {}

  matching(subscriptions: WebhookSubscription[], eventName: string): WebhookSubscription[] {
    return subscriptions.filter((sub) => sub.enabled && sub.event === eventName);
  }

  async deliver(
    event: DomainEvent,
    subscriptions: WebhookSubscription[],
  ): Promise<DeliveryOutcome[]> {
    const targets = this.matching(subscriptions, event.name);
    const outcomes: DeliveryOutcome[] = [];

    for (const target of targets) {
      const body = JSON.stringify(event);
      const headers = {
        'content-type': 'application/json',
        'x-botvy-event': event.name,
        'x-botvy-event-id': event.eventId,
        'x-botvy-signature': signPayload(this.secret, body),
      };

      try {
        const response = await this.post(target.url, body, headers);
        outcomes.push(
          response.ok
            ? { url: target.url, ok: true, status: response.status }
            : { url: target.url, ok: false, status: response.status, error: `HTTP ${response.status}` },
        );
      } catch (error) {
        outcomes.push({ url: target.url, ok: false, error: (error as Error).message });
      }
    }

    return outcomes;
  }
}
