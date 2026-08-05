import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { StatusBar } from "../components/layout/StatusBar";
import { FaultCard } from "../components/faults/FaultCard";
import { FaultEvidence } from "../components/faults/FaultEvidence";
import { NetworkMap } from "../components/map/NetworkMap";
import { SimulatorPanel } from "../components/simulator/SimulatorPanel";
import { TicketDetail } from "../components/tickets/TicketDetail";
import { TicketList } from "../components/tickets/TicketList";
import {
  dashboardKeys,
  useDashboardSummary,
  useFaults,
  useNetwork,
  useSimulatorScenarios,
  useTickets,
  useTopology,
} from "../hooks/useDashboardData";
import { useWebSocket } from "../hooks/useWebSocket";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [polling, setPolling] = useState(false);
  const [selectedFaultId, setSelectedFaultId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const refreshAuthoritativeData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardKeys.summary }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.faults }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tickets }),
      queryClient.invalidateQueries({ queryKey: ["network", "pole-states"] }),
    ]);
  }, [queryClient]);
  const resyncAfterConnection = useCallback(async () => {
    setPolling(false);
    await refreshAuthoritativeData();
  }, [refreshAuthoritativeData]);
  const websocket = useWebSocket({
    onMessage: () => void refreshAuthoritativeData(),
    onResync: resyncAfterConnection,
    onPollingFallback: () => setPolling(true),
  });

  const summary = useDashboardSummary(polling);
  const faults = useFaults(polling);
  const tickets = useTickets(polling);
  const scenarios = useSimulatorScenarios();
  const selectedFault = useMemo(
    () =>
      faults.data?.find((fault) => fault.fault_id === selectedFaultId) ??
      faults.data?.[0] ??
      null,
    [faults.data, selectedFaultId],
  );
  const network = useNetwork(selectedFault?.dt_id ?? null, polling);
  const topology = useTopology(selectedFault?.dt_id ?? null);
  const selectedTicket = useMemo(
    () =>
      tickets.data?.find((ticket) => ticket.ticket_id === selectedTicketId) ??
      tickets.data?.find(
        (ticket) => ticket.fault_id === selectedFault?.fault_id,
      ) ??
      tickets.data?.[0] ??
      null,
    [tickets.data, selectedFault?.fault_id, selectedTicketId],
  );

  return (
    <AppShell
      connected={websocket.connected}
      polling={websocket.usingPollingFallback}
    >
      <StatusBar summary={summary.data} />
      <main className="dashboard-grid">
        <aside className="dashboard-column dashboard-column--left">
          <section className="panel-list">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Incidents</p>
                <h2>Active faults</h2>
              </div>
              <span>{faults.data?.length ?? 0}</span>
            </div>
            {faults.isLoading ? (
              <p className="loading-copy">Loading faults…</p>
            ) : faults.data?.length ? (
              faults.data.map((fault) => (
                <FaultCard
                  key={fault.fault_id}
                  fault={fault}
                  selected={fault.fault_id === selectedFault?.fault_id}
                  onSelect={() => setSelectedFaultId(fault.fault_id)}
                />
              ))
            ) : (
              <p className="empty-list">No active faults.</p>
            )}
          </section>
          <TicketList
            tickets={tickets.data ?? []}
            selectedTicketId={selectedTicket?.ticket_id ?? null}
            onSelect={setSelectedTicketId}
          />
        </aside>
        <section className="dashboard-column dashboard-column--map">
          <NetworkMap
            poles={network.poles.data ?? []}
            dts={network.dts.data?.data ?? []}
            topology={topology.data}
            selectedFault={selectedFault}
          />
          <SimulatorPanel
            scenarios={scenarios.data}
            selectedFault={selectedFault}
          />
        </section>
        <aside className="dashboard-column dashboard-column--right">
          <FaultEvidence fault={selectedFault} />
          <TicketDetail ticket={selectedTicket} />
        </aside>
      </main>
    </AppShell>
  );
}
