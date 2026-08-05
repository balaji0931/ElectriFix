import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";
import { dashboardKeys } from "./useDashboardData";

export function useTicketActions() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardKeys.summary }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tickets }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.faults }),
    ]);
  return {
    acknowledge: useMutation({
      mutationFn: ({ ticketId, notes }: { ticketId: string; notes?: string }) =>
        api.acknowledge(ticketId, notes),
      onSuccess: refresh,
    }),
    assign: useMutation({
      mutationFn: ({
        ticketId,
        crew,
        notes,
      }: {
        ticketId: string;
        crew: string;
        notes?: string;
      }) => api.assign(ticketId, crew, notes),
      onSuccess: refresh,
    }),
    resolve: useMutation({
      mutationFn: ({ ticketId, notes }: { ticketId: string; notes?: string }) =>
        api.resolve(ticketId, notes),
      onSuccess: refresh,
    }),
  };
}
