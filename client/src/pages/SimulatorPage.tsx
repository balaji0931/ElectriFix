import { SimulatorPanel } from "../components/simulator/SimulatorPanel";
import { useSimulatorScenarios } from "../hooks/useDashboardData";

/** Retained as a focused simulator surface for future routed navigation. */
export function SimulatorPage() {
  const scenarios = useSimulatorScenarios();
  return <SimulatorPanel scenarios={scenarios.data} selectedFault={null} />;
}
