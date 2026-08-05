import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
  faults: ["faults"] as const,
  tickets: ["tickets"] as const,
  poles: (dtId: string | null) => ["network", "pole-states", dtId] as const,
  dts: ["network", "dts"] as const,
  topology: (dtId: string) => ["network", "topology", dtId] as const,
  scenarios: ["simulator", "scenarios"] as const,
};

export function useDashboardSummary(polling: boolean) {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: api.dashboard,
    refetchInterval: polling ? 5_000 : false,
  });
}

export function useFaults(polling: boolean) {
  return useQuery({
    queryKey: dashboardKeys.faults,
    queryFn: api.faults,
    refetchInterval: polling ? 5_000 : false,
  });
}

export function useTickets(polling: boolean) {
  return useQuery({
    queryKey: dashboardKeys.tickets,
    queryFn: api.tickets,
    refetchInterval: polling ? 5_000 : false,
  });
}

export function useNetwork(dtId: string | null, polling: boolean) {
  const poles = useQuery({
    queryKey: dashboardKeys.poles(dtId),
    queryFn: () => api.poleStates(dtId ?? undefined),
    enabled: dtId !== null,
    refetchInterval: polling ? 5_000 : false,
  });
  const dts = useQuery({
    queryKey: dashboardKeys.dts,
    queryFn: api.dts,
    staleTime: 60_000,
  });
  return { poles, dts };
}

export function useTopology(dtId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.topology(dtId ?? "none"),
    queryFn: () => api.topology(dtId ?? ""),
    enabled: dtId !== null,
    staleTime: 60_000,
  });
}

export function useSimulatorScenarios() {
  return useQuery({
    queryKey: dashboardKeys.scenarios,
    queryFn: api.scenarios,
  });
}
