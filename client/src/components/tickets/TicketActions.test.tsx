import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/types";
import { ticketFixture } from "../../test/fixtures";
import { TicketActions } from "./TicketActions";

const acknowledge = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    acknowledge: (...args: unknown[]) => acknowledge(...args),
    assign: vi.fn(),
    resolve: vi.fn(),
  },
}));

function renderActions() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TicketActions ticket={ticketFixture} />
    </QueryClientProvider>,
  );
}

describe("TicketActions", () => {
  it("delegates acknowledgement to the backend action", async () => {
    acknowledge.mockResolvedValue(ticketFixture);
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith("ticket-1", ""),
    );
  });

  it("surfaces server lifecycle conflicts without recreating lifecycle rules", async () => {
    acknowledge.mockRejectedValueOnce(
      new ApiError(
        409,
        "INVALID_TRANSITION",
        "Telemetry has not verified restoration.",
      ),
    );
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    expect(
      await screen.findByText(
        "The server rejected this transition: Telemetry has not verified restoration.",
      ),
    ).toBeInTheDocument();
  });
});
