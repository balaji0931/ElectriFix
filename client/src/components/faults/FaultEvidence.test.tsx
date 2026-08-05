import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { faultFixture } from "../../test/fixtures";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { FaultEvidence } from "./FaultEvidence";

describe("FaultEvidence", () => {
  it("renders structured evidence and makes a missing AI summary explicit", () => {
    render(<FaultEvidence fault={faultFixture} />);

    expect(screen.getByText("P-001")).toBeInTheDocument();
    expect(screen.getByText("P-002")).toBeInTheDocument();
    expect(screen.getByText("560001")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No generated summary is available. Use the structured evidence above.",
      ),
    ).toBeInTheDocument();
  });

  it("labels confidence without concealing the underlying level", () => {
    render(<ConfidenceBadge level="MEDIUM" />);

    expect(screen.getByText("MEDIUM")).toHaveAttribute("data-level", "MEDIUM");
  });
});
