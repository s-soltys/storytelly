import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";

describe("Card components", () => {
  it("renders all card parts with correct styles", () => {
    render(
      <Card className="custom-card">
        <CardHeader className="custom-header">
          <CardTitle className="custom-title">Title</CardTitle>
          <CardDescription className="custom-desc">Description</CardDescription>
        </CardHeader>
        <CardContent className="custom-content">Content</CardContent>
        <CardFooter className="custom-footer">Footer</CardFooter>
      </Card>
    );

    const card = screen.getByText("Title").closest("div.custom-card");
    expect(card).toBeInTheDocument();
    expect(card?.className).toContain("bg-[var(--color-surface)]");

    const header = screen.getByText("Title").closest("div.custom-header");
    expect(header).toBeInTheDocument();
    expect(header?.className).toContain("flex-col");

    expect(screen.getByText("Title").tagName).toBe("H3");
    expect(screen.getByText("Description").tagName).toBe("P");
    expect(screen.getByText("Content").className).toContain("p-6 pt-0");
    expect(screen.getByText("Footer").className).toContain("custom-footer");
  });
});
