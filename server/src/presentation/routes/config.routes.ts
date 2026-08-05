import { Router } from "express";
import type { ProductPolicies } from "../../config/policies.js";
import { configResponse } from "../api-serializers.js";

export function createConfigRouter(policies: ProductPolicies) {
  const router = Router();
  router.get("/config", (_request, response) =>
    response.json(configResponse(policies)),
  );
  return router;
}
