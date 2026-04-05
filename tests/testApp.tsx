import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app";

describe("App", () => {
  it("renders", () => {
    render(<App />);
    expect(screen.getByText("Ichigo Annotate")).toBeInTheDocument();
  });
});
