import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";

import List from "../src/routes/books/+page.svelte";
import Detail from "../src/routes/books/[id]/+page.svelte";

const listData = {
  books: [
    {
      id: 1,
      work_key: "sotc",
      title: "Shadow of the Colossus",
      author: "Nick Suttner",
      format: "epub",
      cover: { id: 1 },
    },
    { id: 2, work_key: "ico", title: "Ico", author: null, format: "epub", cover: null },
  ],
  counts: { books: 2, pages: 10, chunks: 4, concepts: 3, images: 5 },
  error: null,
};

const detailData = {
  book: { id: 1, title: "Shadow of the Colossus", work_key: "sotc", author: "Nick Suttner", format: "epub" },
  pages: [{ id: 1, page_no: 1, scanned: 0, chars: 48 }],
  images: [
    { id: 1, page_no: 1, kind: "embedded", caption: "cover art", has_thumb: 1 },
    { id: 7, page_no: 4, kind: "extracted", caption: null, has_thumb: 1 },
  ],
  cover: { id: 1 },
  error: null,
};

describe("book browse list", () => {
  it("shows a cover thumbnail for a book and a placeholder when absent", () => {
    const { container } = render(List, { data: listData });
    expect(screen.getByAltText(/Shadow of the Colossus cover/i)).toHaveAttribute("src", "/thumb/1");
    expect(container.querySelector(".cover.placeholder")).not.toBeNull();
  });

  it("surfaces a data error", () => {
    render(List, { data: { books: [], counts: null, error: "no mount" } });
    expect(screen.getByText(/Data unavailable/)).toBeInTheDocument();
  });
});

describe("book browse detail", () => {
  it("renders the cover hero and the art grid", () => {
    const { container } = render(Detail, { data: detailData });
    expect(screen.getByAltText(/Shadow of the Colossus cover/i)).toHaveAttribute("src", "/thumb/1");
    expect(container.querySelectorAll(".grid .tile")).toHaveLength(2);
  });

  it("links each image tile back to its page anchor", () => {
    const { container } = render(Detail, { data: detailData });
    const hrefs = [...container.querySelectorAll(".grid .tile > a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/books/1#page-1", "/books/1#page-4"]);
    // and a secondary link opens the full image
    expect(container.querySelector('a[href="/image/7"]')).not.toBeNull();
  });

  it("renders pages inside anchors", () => {
    const { container } = render(Detail, { data: detailData });
    expect(container.querySelector("#page-1")).not.toBeNull();
  });
});
