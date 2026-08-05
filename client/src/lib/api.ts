import {
  ApiError,
  type DashboardSummary,
  type DistributionTransformer,
  type Fault,
  type NetworkTopology,
  type PoleState,
  type SimulationReceipt,
  type SimulationScenarios,
  type Ticket,
} from "./types";

interface Page<T> {
  data: T[];
  pagination: { next_cursor: string | null; has_more: boolean };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}

async function allPages<T>(path: string, limit = 200): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    const separator = path.includes("?") ? "&" : "?";
    const page = await request<Page<T>>(
      `${path}${separator}${query.toString()}`,
    );
    results.push(...page.data);
    cursor = page.pagination.next_cursor;
  } while (cursor);
  return results;
}

export const api = {
  dashboard: () => request<DashboardSummary>("/dashboard/summary"),
  faults: () => allPages<Fault>("/faults"),
  tickets: () => allPages<Ticket>("/tickets"),
  ticket: (ticketId: string) => request<Ticket>(`/tickets/${ticketId}`),
  poleStates: (dtId?: string) =>
    allPages<PoleState>(
      `/poles/states${dtId ? `?dt_id=${encodeURIComponent(dtId)}` : ""}`,
    ),
  dts: () => request<{ data: DistributionTransformer[] }>("/network/dts"),
  topology: (dtId: string) =>
    request<NetworkTopology>(`/network/topology/${encodeURIComponent(dtId)}`),
  scenarios: () => request<SimulationScenarios>("/simulator/scenarios"),
  acknowledge: (ticketId: string, operatorNotes?: string) =>
    request<Ticket>(`/tickets/${ticketId}/acknowledge`, {
      method: "PATCH",
      body: JSON.stringify({ operator_notes: operatorNotes || undefined }),
    }),
  assign: (ticketId: string, assignedCrew: string, operatorNotes?: string) =>
    request<Ticket>(`/tickets/${ticketId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({
        assigned_crew: assignedCrew,
        operator_notes: operatorNotes || undefined,
      }),
    }),
  resolve: (ticketId: string, operatorNotes?: string) =>
    request<Ticket>(`/tickets/${ticketId}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ operator_notes: operatorNotes || undefined }),
    }),
  injectFault: (input: {
    fault_type: "span" | "dt" | "feeder";
    target_id: string;
  }) =>
    request<SimulationReceipt>("/simulator/inject-fault", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  repair: (faultId: string) =>
    request<SimulationReceipt>("/simulator/repair", {
      method: "POST",
      body: JSON.stringify({ fault_id: faultId }),
    }),
  injectNoise: (input: { noise_type: string; target_pole_id?: string }) =>
    request<SimulationReceipt>("/simulator/inject-noise", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
