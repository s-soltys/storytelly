import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input, Textarea } from "./input";

describe("Input components", () => {
  describe("Input", () => {
    it("renders and accepts text input", async () => {
      const handleChange = vi.fn();
      render(<Input placeholder="Enter name" onChange={handleChange} />);
      const input = screen.getByPlaceholderText("Enter name") as HTMLInputElement;

      expect(input).toBeInTheDocument();
      await userEvent.type(input, "John");
      expect(handleChange).toHaveBeenCalled();
      expect(input.value).toBe("John");
    });

    it("can be disabled", () => {
      render(<Input placeholder="Enter name" disabled />);
      const input = screen.getByPlaceholderText("Enter name");
      expect(input).toBeDisabled();
    });
  });

  describe("Textarea", () => {
    it("renders and accepts typing", async () => {
      const handleChange = vi.fn();
      render(<Textarea placeholder="Enter description" onChange={handleChange} />);
      const textarea = screen.getByPlaceholderText("Enter description") as HTMLTextAreaElement;

      expect(textarea).toBeInTheDocument();
      await userEvent.type(textarea, "Once upon a time...");
      expect(handleChange).toHaveBeenCalled();
      expect(textarea.value).toBe("Once upon a time...");
    });

    it("can be disabled", () => {
      render(<Textarea placeholder="Enter description" disabled />);
      const textarea = screen.getByPlaceholderText("Enter description");
      expect(textarea).toBeDisabled();
    });
  });
});
