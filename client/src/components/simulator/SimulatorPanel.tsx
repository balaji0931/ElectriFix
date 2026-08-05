import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api";
import type { Fault, SimulationScenarios } from "../../lib/types";
import { dashboardKeys } from "../../hooks/useDashboardData";

export function SimulatorPanel({
  scenarios,
  selectedFault,
}: {
  readonly scenarios: SimulationScenarios | undefined;
  readonly selectedFault: Fault | null;
}) {
  const queryClient = useQueryClient();
  const [faultType, setFaultType] = useState<"span" | "dt" | "feeder">("dt");
  const [targetId, setTargetId] = useState("");
  const [noiseType, setNoiseType] = useState("duplicate_telemetry");
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardKeys.summary }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.faults }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tickets }),
      queryClient.invalidateQueries({ queryKey: ["network", "pole-states"] }),
    ]);
  const inject = useMutation({
    mutationFn: () =>
      api.injectFault({ fault_type: faultType, target_id: targetId }),
    onSuccess: refresh,
  });
  const repair = useMutation({
    mutationFn: () => api.repair(selectedFault?.fault_id ?? ""),
    onSuccess: refresh,
  });
  const noise = useMutation({
    mutationFn: () => api.injectNoise({ noise_type: noiseType }),
    onSuccess: refresh,
  });
  const targets =
    faultType === "feeder"
      ? (scenarios?.targets.feeders.map((item) => item.feeder_id) ?? [])
      : (scenarios?.targets.dts.map((item) => item.dt_id) ?? []);
  const error = inject.error ?? repair.error ?? noise.error;

  return (
    <section className="simulator-panel" aria-label="Simulator controls">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Demonstration controls</p>
          <h2>Simulator</h2>
        </div>
        <span>Production pipeline</span>
      </div>
      <div className="simulator-grid">
        <label>
          Fault type
          <select
            value={faultType}
            onChange={(event) => {
              const value = event.target.value as "span" | "dt" | "feeder";
              setFaultType(value);
              setTargetId("");
            }}
          >
            <option value="span">Span</option>
            <option value="dt">DT</option>
            <option value="feeder">Feeder</option>
          </select>
        </label>
        <label>
          Target
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Select target</option>
            {targets.map((target) => (
              <option value={target} key={target}>
                {target}
              </option>
            ))}
          </select>
        </label>
        <button
          className="command-button"
          disabled={!targetId || inject.isPending}
          onClick={() => inject.mutate()}
        >
          Inject fault
        </button>
        <button
          className="secondary-button"
          disabled={!selectedFault || repair.isPending}
          onClick={() => repair.mutate()}
        >
          Repair selected fault
        </button>
        <label>
          Noise scenario
          <select
            value={noiseType}
            onChange={(event) => setNoiseType(event.target.value)}
          >
            {scenarios?.noise_types.map((type) => (
              <option value={type} key={type}>
                {type.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={noise.isPending}
          onClick={() => noise.mutate()}
        >
          Inject noise
        </button>
      </div>
      <p className="simulator-note">
        Commands submit telemetry through the production pipeline. Detection and
        verification remain asynchronous.
      </p>
      {(inject.data ?? repair.data ?? noise.data) && (
        <p className="simulation-receipt">
          Simulation admitted:{" "}
          {(inject.data ?? repair.data ?? noise.data)?.simulation_id.slice(
            0,
            8,
          )}
        </p>
      )}
      {error && (
        <p className="command-error" role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}
