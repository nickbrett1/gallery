// @vitest-environment jsdom
// Screen test for the Constellation's interaction copy and keyboard model:
// ←/→ cycle focus around the ring, `d` drifts, and a node-less concept says so.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

const goto = vi.hoisted(() => vi.fn());
vi.mock("$app/navigation", () => ({ goto }));

import Page from "../src/routes/constellation/[id]/+page.svelte";
import { layoutEgo } from "../src/lib/server/graph.js";

const centre = { id: 1, name: "Wander", type: "character", mentions: 20, portrait: null, description: "The protagonist." };
const mono = { id: 3, name: "Mono", type: "character", mentions: 4, shared_pages: 6, portrait: null };
const dormin = { id: 4, name: "Dormin", type: "entity", mentions: 9, shared_pages: 2, portrait: null };

function data(neighbours = [mono, dormin]) {
  return {
    concept: centre,
    neighbours,
    graph: layoutEgo(centre, neighbours),
    citations: 12,
    error: null,
  };
}

beforeEach(() => {
  goto.mockClear();
});

describe("constellation screen", () => {
  it("renders the centre, its neighbours and the honest edge label", () => {
    render(Page, { data: data() });
    expect(screen.getByRole("heading", { name: "Wander" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mono" })).toHaveAttribute("href", "/constellation/3");
    expect(screen.getByText(/appears with/i)).toBeInTheDocument();
    expect(screen.getByText(/no typed relations/i)).toBeInTheDocument();
  });

  it("says a concept has no neighbours instead of drawing an empty canvas", () => {
    render(Page, { data: data([]) });
    expect(screen.getByText(/no neighbours yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/appears with/i)).toBeNull();
    expect(screen.getByRole("link", { name: /citations for Wander/i })).toHaveAttribute("href", "/concepts/1");
  });

  it("cycles focus around the ring with ← and →", async () => {
    render(Page, { data: data() });
    const links = screen.getAllByRole("link", { name: /Mono|Dormin/ });

    await fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[0]);

    await fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[1]);

    await fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[0]);

    await fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(links[1]);
  });

  it("drifts to a neighbour on `d`", async () => {
    render(Page, { data: data() });
    await fireEvent.keyDown(window, { key: "d" });
    expect(goto).toHaveBeenCalledTimes(1);
    expect(goto.mock.calls[0][0]).toMatch(/^\/constellation\/[34]$/);
  });

  it("does nothing on arrow keys when there are no neighbours", async () => {
    render(Page, { data: data([]) });
    await fireEvent.keyDown(window, { key: "ArrowRight" });
    await fireEvent.keyDown(window, { key: "d" });
    expect(goto).not.toHaveBeenCalled();
  });
});
