import { WebSocket } from "ws";

import type { WebSocketMessage } from "../domain/contracts.js";

/**
 * Owns transient WebSocket connections and broadcasts already-serialized
 * application notifications. It intentionally keeps no event history.
 */
export class WebSocketEmitter {
  private readonly clients = new Set<WebSocket>();

  addClient(client: WebSocket): () => void {
    this.clients.add(client);
    const remove = () => this.clients.delete(client);
    client.once("close", remove);
    client.once("error", remove);
    return remove;
  }

  broadcast(message: WebSocketMessage): void {
    const serialized = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }

      try {
        client.send(serialized);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
