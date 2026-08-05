import { useEffect, useRef, useState } from "react";

export interface UseWebSocketOptions {
  readonly url?: string;
  readonly enabled?: boolean;
  readonly onMessage?: (message: unknown) => void;
  /** Fetch authoritative REST read models after every successful connection. */
  readonly onResync?: () => void | Promise<void>;
  /** Start the caller's REST polling fallback while reconnect attempts continue. */
  readonly onPollingFallback?: () => void;
}

export interface WebSocketConnectionState {
  readonly connected: boolean;
  readonly usingPollingFallback: boolean;
}

const initialReconnectDelayMs = 1_000;
const maximumReconnectDelayMs = 30_000;

/**
 * Implements the documented reconnect policy while leaving REST refetching
 * and polling ownership with the consuming screen.
 */
export function useWebSocket(
  options: UseWebSocketOptions,
): WebSocketConnectionState {
  const [connected, setConnected] = useState(false);
  const [usingPollingFallback, setUsingPollingFallback] = useState(false);
  const optionsRef = useRef(options);

  const url = options.url ?? defaultWebSocketUrl();
  const enabled = options.enabled ?? true;

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;
    let fallbackNotified = false;

    const connect = () => {
      if (!active) {
        return;
      }

      socket = new WebSocket(url);
      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        fallbackNotified = false;
        setConnected(true);
        setUsingPollingFallback(false);
        void optionsRef.current.onResync?.();
      });
      socket.addEventListener("message", (event) => {
        try {
          optionsRef.current.onMessage?.(JSON.parse(String(event.data)));
        } catch {
          // Malformed transport data is ignored; REST remains authoritative.
        }
      });
      socket.addEventListener("error", () => {
        socket?.close();
      });
      socket.addEventListener("close", () => {
        if (!active) {
          return;
        }

        setConnected(false);
        setUsingPollingFallback(true);
        if (!fallbackNotified) {
          fallbackNotified = true;
          optionsRef.current.onPollingFallback?.();
        }

        const delayMs = Math.min(
          initialReconnectDelayMs * 2 ** reconnectAttempt,
          maximumReconnectDelayMs,
        );
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delayMs);
      });
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [enabled, url]);

  return {
    connected: enabled && connected,
    usingPollingFallback: enabled && usingPollingFallback,
  };
}

function defaultWebSocketUrl(): string {
  const url = new URL("/ws", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
