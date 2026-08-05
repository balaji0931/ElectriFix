import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWebSocket } from "./useWebSocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  private readonly listeners = new Map<
    string,
    Set<(event: { data?: unknown }) => void>
  >();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: { data?: unknown }) => void,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.dispatch("close");
  }

  open(): void {
    this.dispatch("open");
  }

  private dispatch(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

afterEach(() => {
  MockWebSocket.instances = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useWebSocket", () => {
  it("uses documented reconnect timing and exposes a REST polling fallback", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    const onResync = vi.fn();
    const onPollingFallback = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: "ws://example.test/ws",
        onResync,
        onPollingFallback,
      }),
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => MockWebSocket.instances[0]?.open());
    expect(result.current).toEqual({
      connected: true,
      usingPollingFallback: false,
    });
    expect(onResync).toHaveBeenCalledOnce();

    act(() => MockWebSocket.instances[0]?.close());
    expect(result.current).toEqual({
      connected: false,
      usingPollingFallback: true,
    });
    expect(onPollingFallback).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => MockWebSocket.instances[1]?.open());
    expect(onResync).toHaveBeenCalledTimes(2);
    expect(result.current.usingPollingFallback).toBe(false);
  });
});
