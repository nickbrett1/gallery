import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";

import Detail from "../src/routes/concepts/[id]/+page.svelte";

const data = {
  concept: { id: 1, name: "Wander", type: "character", description: "The protagonist." },
  aliases: ["The Wanderer"],
  surfaces: [{ id: 1, surface: "Wander" }, { id: 2, surface: "the wanderer" }],
  citations: [
    {
      id: 1,
      surface: "Wander",
      page_no: 1,
      page_id: 1,
      book_id: 1,
      title: "Shadow of the Colossus",
      work_key: "sotc",
      start_offset: 0,
      end_offset: 6,
    },
  ],
  related: [{ id: 2, name: "Mono", type: "character" }],
  error: null,
};

describe("concept detail", () => {
  it("renders the concept, type and alias", () => {
    render(Detail, { data });
    expect(screen.getByRole("heading", { name: /Wander/ })).toBeInTheDocument();
    expect(screen.getByText(/also known as: The Wanderer/)).toBeInTheDocument();
  });

  it("renders surface forms", () => {
    render(Detail, { data });
    expect(screen.getByText("the wanderer")).toBeInTheDocument();
  });

  it("keeps the co-occurrence wording honest (Appears with)", () => {
    render(Detail, { data });
    expect(screen.getByRole("heading", { name: /Appears with/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mono" })).toHaveAttribute("href", "/concepts/2");
  });

  it("links every citation back to its page", () => {
    render(Detail, { data });
    expect(screen.getByRole("link", { name: /Shadow of the Colossus — page 1/ })).toHaveAttribute(
      "href",
      "/books/1#page-1",
    );
  });

  it("shows the empty-citations state", () => {
    render(Detail, { data: { ...data, citations: [], related: [], aliases: [] } });
    expect(screen.getByText(/No citations recorded/)).toBeInTheDocument();
  });
});
