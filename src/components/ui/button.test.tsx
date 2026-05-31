import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button component", () => {
  it("renders children correctly", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("applies variant and size classes", () => {
    const { rerender } = render(<Button variant="danger" size="lg">Button</Button>);
    let btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[var(--color-danger)]");
    expect(btn.className).toContain("h-11");

    rerender(<Button variant="outline" size="sm">Button</Button>);
    btn = screen.getByRole("button");
    expect(btn.className).toContain("border-[var(--color-accent)]");
    expect(btn.className).toContain("h-8");
  });

  it("handles clicks", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("disables the button when disabled prop is true", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>Click</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders as child if asChild is true", () => {
    render(
      <Button asChild>
        <a href="https://example.com">Link Button</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link.className).toContain("inline-flex");
  });
});
