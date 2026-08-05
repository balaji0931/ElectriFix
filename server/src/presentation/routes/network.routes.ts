import { Router } from "express";
import type { GetNetworkData } from "../../application/get-network-data.js";
import { HttpError } from "../http-error.js";
import { page, pagination } from "./route-helpers.js";

export function createNetworkRouter(data: GetNetworkData) {
  const router = Router();
  router.get("/poles/states", (request, response, next) => {
    try {
      const { limit, offset } = pagination(request.query, 200);
      const byId = new Map(
        data.poleStates().map((state) => [state.poleId, state]),
      );
      const items = data
        .poles()
        .filter(
          (pole) => !request.query.dtId || pole.dtId === request.query.dtId,
        )
        .filter(
          (pole) =>
            !request.query.feederId || pole.feederId === request.query.feederId,
        )
        .filter((pole) => {
          const state = byId.get(pole.poleId);
          return (
            !request.query.energized ||
            state?.energized === request.query.energized
          );
        })
        .map((pole) => {
          const state = byId.get(pole.poleId);
          if (!state) throw new Error(`Pole state missing for ${pole.poleId}`);
          return {
            pole_id: pole.poleId,
            lat: pole.lat,
            lon: pole.lon,
            dt_id: pole.dtId,
            feeder_id: pole.feederId,
            energized: state.energized,
            has_device: state.hasDevice,
            device_health: state.deviceHealth,
            last_heartbeat_at: state.lastHeartbeatAt?.toISOString() ?? null,
            firmware_version: state.firmwareVersion,
          };
        });
      return response.json(page(items, limit, offset, false));
    } catch (error) {
      return next(error);
    }
  });
  router.get("/poles/states/:poleId", (request, response, next) => {
    try {
      const pole = data
        .poles()
        .find((item) => item.poleId === request.params.poleId);
      const state = data.poleState(request.params.poleId);
      if (!pole || !state)
        throw new HttpError(404, "NOT_FOUND", "Pole state not found");
      return response.json({
        pole_id: pole.poleId,
        lat: pole.lat,
        lon: pole.lon,
        dt_id: pole.dtId,
        feeder_id: pole.feederId,
        energized: state.energized,
        has_device: state.hasDevice,
        device_health: state.deviceHealth,
        last_heartbeat_at: state.lastHeartbeatAt?.toISOString() ?? null,
        firmware_version: state.firmwareVersion,
      });
    } catch (error) {
      return next(error);
    }
  });
  router.get("/network/poles", (request, response, next) => {
    try {
      const { limit, offset } = pagination(request.query);
      const items = data
        .poles()
        .filter(
          (pole) => !request.query.dtId || pole.dtId === request.query.dtId,
        )
        .filter(
          (pole) =>
            !request.query.feederId || pole.feederId === request.query.feederId,
        )
        .map((pole) => ({
          pole_id: pole.poleId,
          lat: pole.lat,
          lon: pole.lon,
          dt_id: pole.dtId,
          feeder_id: pole.feederId,
          seq_on_line: pole.seqOnLine,
          parent_pole_id: pole.parentPoleId,
          pincode: pole.pincode,
          device_id: pole.deviceId,
          pole_type: pole.poleType,
        }));
      return response.json(page(items, limit, offset, false));
    } catch (error) {
      return next(error);
    }
  });
  router.get("/network/dts", (_request, response) =>
    response.json({
      data: data.distributionTransformers().map((dt) => ({
        dt_id: dt.dtId,
        feeder_id: dt.feederId,
        lat: dt.lat,
        lon: dt.lon,
        capacity_kva: dt.capacityKva,
        households_served: dt.householdsServed,
        has_recorded_topology: dt.hasRecordedTopology,
        pole_count: data.poles().filter((pole) => pole.dtId === dt.dtId).length,
      })),
    }),
  );
  router.get("/network/feeders", (_request, response) =>
    response.json({
      data: data.feeders().map((feeder) => ({
        feeder_id: feeder.feederId,
        substation_id: feeder.substationId,
        name: feeder.name,
        dt_count: data
          .distributionTransformers()
          .filter((dt) => dt.feederId === feeder.feederId).length,
      })),
    }),
  );
  router.get("/network/topology/:dtId", (request, response, next) => {
    try {
      if (
        !data
          .distributionTransformers()
          .some((dt) => dt.dtId === request.params.dtId)
      )
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Distribution transformer not found",
        );
      const graph = data.topology(request.params.dtId);
      return response.json({
        dt_id: request.params.dtId,
        source: graph.source,
        nodes: graph
          .descendants(graph.root())
          .filter((node) => node.kind === "POLE")
          .map((node) => ({
            pole_id: node.poleId,
            lat: node.coordinates.lat,
            lon: node.coordinates.lon,
          })),
        edges: graph
          .descendants(graph.root())
          .filter((node) => node.kind === "POLE")
          .flatMap((node) => {
            const parent = graph.parent(node);
            return parent?.kind === "POLE"
              ? [{ parent: parent.poleId, child: node.poleId }]
              : [];
          }),
      });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
