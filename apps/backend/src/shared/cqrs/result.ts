/**
 * The command acknowledgement shape the blueprint fixes for every REST command:
 * an ack or an id, never a view. Reads go through GraphQL or the sync pull.
 */
export interface CommandAck {
  id: string;
  updatedAt: Date;
}

export interface OkAck {
  ok: true;
}

export function ack(id: string, updatedAt: Date): CommandAck {
  return { id, updatedAt };
}
