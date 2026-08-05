import type { ReactNode } from "react";

interface AppShellProps {
  readonly children: ReactNode;
  readonly connected: boolean;
  readonly polling: boolean;
}

export function AppShell({ children, connected, polling }: AppShellProps) {
  return (
    <div className="console-shell">
      <header className="console-header">
        <div>
          <p className="eyebrow">Distribution operations</p>
          <h1>ElectriFix</h1>
        </div>
        <div
          className="connection-state"
          data-tone={connected ? "live" : "warn"}
        >
          <span className="status-dot" />
          {connected
            ? "Live updates connected"
            : polling
              ? "REST polling active"
              : "Connecting"}
        </div>
      </header>
      {children}
    </div>
  );
}
