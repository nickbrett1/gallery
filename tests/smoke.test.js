import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";

import Page from "../src/routes/+page.svelte";
import { GET } from "../src/routes/health/+server.js";

function pageData(over = {}) {
  return {
    q: "",
    kinds: null,
    mode: "hybrid",
    grouped: null,
    error: null,
    ...over,
  };
}

const grouped = {
  works: [
    {
      workKey: "sotc",
      bookId: 1,
      title: "Shadow of the Colossus",
      hits: [
        {
          kind: "text",
          href: "/books/1#page-1",
          title: "Shadow of the Colossus",
          workKey: "sotc",
          pageNo: 1,
          startOffset: 0,
          endOffset: 6,
          text: "Wander enters the Forbidden Lands.",
          score: 0.9,
        },
      ],
    },
  ],
  concepts: [{ kind: "concept", href: "/concepts/1", name: "Wander", type: "character", description: "The protagonist." }],
  images: [{ kind: "image", href: "/images?focus=1", imageId: 1, pageNo: 1, kindLabel: "embedded" }],
};

describe("search screen", () => {
  it("renders the search box and filters", () => {
    render(Page, { data: pageData() });
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("renders grouped text results with a page citation", () => {
    render(Page, { data: pageData({ q: "forbidden", grouped }) });
    const links = screen.getAllByRole("link", { name: /page 1/i });
    expect(links.some((l) => l.getAttribute("href") === "/books/1#page-1")).toBe(true);
    expect(screen.getByText(/Forbidden Lands/)).toBeInTheDocument();
  });

  it("renders concept and art sections", () => {
    render(Page, { data: pageData({ q: "wander", grouped }) });
    expect(screen.getByRole("link", { name: "Wander" })).toHaveAttribute("href", "/concepts/1");
    expect(screen.getByAltText(/page 1 art/i)).toHaveAttribute("src", "/thumb/1");
  });

  it("badges each result with its kind (text, concept, art)", () => {
    const { container } = render(Page, { data: pageData({ q: "wander", grouped }) });
    expect(container.querySelector('[data-kind="text"]')).not.toBeNull();
    expect(container.querySelector('[data-kind="concept"]')).not.toBeNull();
    expect(container.querySelector('[data-kind="image"]')).not.toBeNull();
  });

  it("surfaces a data error instead of a blank page", () => {
    render(Page, { data: pageData({ error: "ENOENT: no such file" }) });
    expect(screen.getByText(/Data unavailable/)).toBeInTheDocument();
  });
});

describe("health endpoint", () => {
  it("always answers 200 JSON with a status field (Homepage widget)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(["ok", "degraded"]).toContain(body.status);
  });
});
