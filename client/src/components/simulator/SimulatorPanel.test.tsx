import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { faultFixture } from "../../test/fixtures";
import { SimulatorPanel } from "./SimulatorPanel";

const injectFault = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    injectFault: (...args: unknown[]) => injectFault(...args),
    repair: vi.fn(),
    injectNoise: vi.fn(),
  },
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SimulatorPanel
        selectedFault={faultFixture}
        scenarios={{
          fault_types: ["span", "dt", "feeder"],
          noise_types: ["duplicate_telemetry"],
          targets: {
            feeders: [{ feeder_id: "FEEDER-001", dt_count: 1, pole_count: 10 }],
            dts: [
              {
                dt_id: "DT-001",
                feeder_id: "FEEDER-001",
                pole_count: 10,
                has_recorded_topology: true,
              },
            ],
          },
        }}
      />
    </QueryClientProvider>,
  );
}

describe("SimulatorPanel", () => {
  it("submits documented simulator commands through the REST client", async () => {
    injectFault.mockResolvedValue({
      simulation_id: "simulation-1",
      status: "running",
      started_at: "2026-08-05T10:00:00.000Z",
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText("Target"), {
      target: { value: "DT-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inject fault" }));

    await waitFor(() =>
      expect(injectFault).toHaveBeenCalledWith({
        fault_type: "dt",
        target_id: "DT-001",
      }),
    );
    expect(await screen.findByText(/Simulation admitted:/)).toBeInTheDocument();
  });
});
