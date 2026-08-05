import { useEffect } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";

import type {
  DistributionTransformer,
  Fault,
  NetworkTopology,
  PoleState,
} from "../../lib/types";

const Bengaluru: LatLngExpression = [12.9716, 77.5946];

export function NetworkMap({
  poles,
  dts,
  topology,
  selectedFault,
}: {
  readonly poles: PoleState[];
  readonly dts: DistributionTransformer[];
  readonly topology?: NetworkTopology;
  readonly selectedFault: Fault | null;
}) {
  const selectedDt = selectedFault
    ? dts.find((dt) => dt.dt_id === selectedFault.dt_id)
    : undefined;
  const nodes = new Map(
    topology?.nodes.map((node) => [node.pole_id, node]) ?? [],
  );
  return (
    <section className="network-map" aria-label="Network map">
      <MapContainer
        center={Bengaluru}
        zoom={13}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocus fault={selectedFault} />
        {topology?.source !== "FALLBACK" &&
          topology?.edges.map((edge) => {
            const parent = nodes.get(edge.parent);
            const child = nodes.get(edge.child);
            if (!parent || !child) return null;
            return (
              <Polyline
                key={`${edge.parent}-${edge.child}`}
                positions={[
                  [parent.lat, parent.lon],
                  [child.lat, child.lon],
                ]}
                pathOptions={{
                  color: topology.source === "INFERRED" ? "#8b5cf6" : "#334155",
                  dashArray: topology.source === "INFERRED" ? "6 8" : undefined,
                  weight: 2,
                }}
              />
            );
          })}
        {selectedFault?.topology_source === "FALLBACK" && selectedDt && (
          <Circle
            center={[selectedDt.lat, selectedDt.lon]}
            radius={240}
            pathOptions={{
              color: "#d97706",
              fillColor: "#f59e0b",
              fillOpacity: 0.2,
              dashArray: "8 8",
            }}
          >
            <Tooltip permanent direction="top">
              DT area: exact span unknown
            </Tooltip>
          </Circle>
        )}
        {poles.map((pole) => (
          <CircleMarker
            key={pole.pole_id}
            center={[pole.lat, pole.lon]}
            radius={3.5}
            pathOptions={{
              color: poleColor(pole.energized),
              fillColor: poleColor(pole.energized),
              fillOpacity: 0.86,
              weight: 1,
            }}
          >
            <Tooltip>
              {pole.pole_id} · {pole.energized}
            </Tooltip>
          </CircleMarker>
        ))}
        {dts.map((dt) => (
          <CircleMarker
            key={dt.dt_id}
            center={[dt.lat, dt.lon]}
            radius={7}
            pathOptions={{
              color: "#0f766e",
              fillColor: "#14b8a6",
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip>
              {dt.dt_id} · {dt.pole_count} poles
            </Tooltip>
          </CircleMarker>
        ))}
        {selectedFault && (
          <CircleMarker
            center={[selectedFault.lat, selectedFault.lon]}
            radius={12}
            pathOptions={{
              color: "#991b1b",
              fillColor: "#ef4444",
              fillOpacity: 0.85,
              weight: 3,
            }}
          >
            <Tooltip permanent direction="top">
              {selectedFault.fault_type.toUpperCase()} ·{" "}
              {selectedFault.confidence_level}
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
      <div className="map-legend" aria-label="Map legend">
        <span>
          <i data-state="LIVE" />
          Live
        </span>
        <span>
          <i data-state="DARK" />
          Dark
        </span>
        <span>
          <i data-state="PRESUMED_DARK" />
          Presumed dark
        </span>
        <span>
          <i data-state="DT" />
          DT
        </span>
      </div>
    </section>
  );
}

function MapFocus({ fault }: { readonly fault: Fault | null }) {
  const map = useMap();
  useEffect(() => {
    if (fault) map.setView([fault.lat, fault.lon], 16, { animate: true });
  }, [fault, map]);
  return null;
}

function poleColor(state: PoleState["energized"]) {
  return {
    LIVE: "#16a34a",
    DARK: "#dc2626",
    PRESUMED_DARK: "#f59e0b",
    UNKNOWN: "#64748b",
  }[state];
}
