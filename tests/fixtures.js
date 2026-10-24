// Test fixtures: build a real schema-v5 SQLite record so the server libs are
// exercised against the actual contract (never a hand-waved mock of it).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

// The reader schema (v1 + v2 + v3 + v4 + v5), trimmed to what gallery reads. Kept
// verbatim enough to be a faithful contract check. v3 is additive: seven
// checkpoint columns on `book`, a unique index on `concept_mention`, and the
// `spend` table. Gallery reads none of them, but the fixture must match the
// version it claims.
const DDL = `
CREATE TABLE schema_version (
  version INTEGER NOT NULL, applied_at TEXT NOT NULL,
  embedding_dimensions INTEGER, embedding_model TEXT, embed_config_version TEXT);
CREATE TABLE book (
  id INTEGER PRIMARY KEY, work_key TEXT NOT NULL UNIQUE, title TEXT, author TEXT,
  format TEXT NOT NULL, source_path TEXT NOT NULL, source_sha256 TEXT NOT NULL, added_at TEXT NOT NULL,
  extracted_source_sha256 TEXT, extractor_version TEXT, extracted_at TEXT,
  images_source_sha256 TEXT, images_extracted_at TEXT,
  concepts_source_sha256 TEXT, concepts_extracted_at TEXT);
CREATE TABLE document_page (
  id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, page_no INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '', scanned INTEGER NOT NULL DEFAULT 0,
  extractor_version TEXT NOT NULL, source_sha256 TEXT NOT NULL, UNIQUE (book_id, page_no));
CREATE TABLE chunk (
  id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL, ordinal INTEGER NOT NULL,
  start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, text TEXT NOT NULL,
  embed_model_id TEXT, dimensions INTEGER, embed_config_version TEXT, embedded_at TEXT,
  UNIQUE (page_id, ordinal));
CREATE TABLE image (
  id INTEGER PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, path TEXT NOT NULL, phash TEXT,
  w INTEGER, h INTEGER, mime TEXT NOT NULL, bytes INTEGER NOT NULL, book_id INTEGER,
  page_no INTEGER, kind TEXT NOT NULL, extractor_version TEXT NOT NULL,
  source_sha256 TEXT NOT NULL, caption TEXT, thumb BLOB,
  embed_model_id TEXT, dimensions INTEGER, embed_config_version TEXT, embedded_at TEXT);
CREATE TABLE concept (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'term',
  description TEXT, embed_model_id TEXT, dimensions INTEGER, embed_config_version TEXT,
  embedded_at TEXT, UNIQUE (name, type));
CREATE TABLE concept_surface (
  id INTEGER PRIMARY KEY, concept_id INTEGER NOT NULL, surface TEXT NOT NULL, UNIQUE (concept_id, surface));
CREATE TABLE concept_mention (
  id INTEGER PRIMARY KEY, concept_id INTEGER NOT NULL, surface_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL);
CREATE UNIQUE INDEX uq_mention ON concept_mention (concept_id, page_id, start_offset, end_offset);
CREATE TABLE concept_review (
  id INTEGER PRIMARY KEY, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  decision TEXT NOT NULL, decided_by TEXT NOT NULL, confidence REAL, decided_at TEXT NOT NULL);
CREATE TABLE concept_merge (from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, PRIMARY KEY (from_id, to_id));
CREATE TABLE concept_resolution (concept_id INTEGER PRIMARY KEY, resolved_id INTEGER NOT NULL);
CREATE TABLE spend (
  id INTEGER PRIMARY KEY, run_id INTEGER, stage TEXT NOT NULL, kind TEXT NOT NULL,
  model TEXT NOT NULL, items INTEGER NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  usd REAL NOT NULL DEFAULT 0, measured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);

-- v4: the quote layer. Verbatim from reader's MIGRATIONS[4] (book gains three
-- nullable TEXT columns; quote/quote_concept/quote_review as reader creates them).
ALTER TABLE book ADD COLUMN quotes_source_sha256 TEXT;
ALTER TABLE book ADD COLUMN quotes_extractor_version TEXT;
ALTER TABLE book ADD COLUMN quotes_extracted_at TEXT;
CREATE TABLE IF NOT EXISTS quote (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES document_page(id),
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  text TEXT NOT NULL,
  score REAL NOT NULL,
  kind TEXT NOT NULL,
  rationale TEXT,
  extractor_version TEXT NOT NULL,
  model_id TEXT NOT NULL DEFAULT '',
  source_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, start_offset, end_offset));
CREATE INDEX IF NOT EXISTS idx_quote_page ON quote(page_id);
CREATE INDEX IF NOT EXISTS quote_rank ON quote(score DESC, id);
CREATE TABLE IF NOT EXISTS quote_concept (
  quote_id INTEGER NOT NULL REFERENCES quote(id),
  concept_id INTEGER NOT NULL REFERENCES concept(id),
  confidence REAL NOT NULL,
  decided_by TEXT NOT NULL DEFAULT 'llm',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (quote_id, concept_id));
CREATE INDEX IF NOT EXISTS quote_concept_concept ON quote_concept(concept_id, confidence DESC);
CREATE TABLE IF NOT EXISTS quote_review (
  quote_id INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject','demote')),
  decided_by TEXT NOT NULL,
  note TEXT,
  request_id TEXT,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')));

-- v5: per-page extraction checkpoints.
DROP INDEX IF EXISTS quote_page;
CREATE INDEX IF NOT EXISTS idx_quote_page ON quote(page_id);
CREATE TABLE IF NOT EXISTS quote_page (
  page_id INTEGER PRIMARY KEY REFERENCES document_page(id),
  source_sha256 TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  extracted_at TEXT NOT NULL);
`;

export function makeFixture({ withQuotes = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "gallery-test-"));
  const dbPath = path.join(dir, "reader.db");
  const imagesDir = path.join(dir, "images");
  mkdirSync(path.join(imagesDir, "ab"), { recursive: true });
  const blobPath = path.join(imagesDir, "ab", "abc.png");
  writeFileSync(blobPath, Buffer.from([1, 2, 3, 4]));

  const db = new Database(dbPath);
  db.exec(DDL);
  db.prepare(
    `INSERT INTO schema_version (version, applied_at, embedding_dimensions, embedding_model, embed_config_version)
     VALUES (5, '2026-10-24', 2048, 'cohere/embed-v5.0', '2')`,
  ).run();
  db.prepare(
    `INSERT INTO book (id, work_key, title, author, format, source_path, source_sha256, added_at)
     VALUES (1, 'sotc', 'Shadow of the Colossus', 'Nick Suttner', 'epub', 'sotc.epub', 'deadbeef', '2026-10-12')`,
  ).run();
  const pageText = "Wander enters the Forbidden Lands to revive Mono.";
  db.prepare(
    `INSERT INTO document_page (id, book_id, page_no, text, scanned, extractor_version, source_sha256)
     VALUES (1, 1, 1, ?, 0, '1', 'deadbeef')`,
  ).run(pageText);
  db.prepare(
    `INSERT INTO chunk (id, page_id, ordinal, start_offset, end_offset, text, embed_model_id, dimensions, embed_config_version, embedded_at)
     VALUES (1, 1, 0, 0, ?, ?, 'cohere/embed-v5.0', 2048, '2', '2026-10-12')`,
  ).run(pageText.length, pageText);
  db.prepare(
    `INSERT INTO image (id, sha256, path, w, h, mime, bytes, book_id, page_no, kind, extractor_version, source_sha256, caption, thumb)
     VALUES (1, 'abcdef', ?, 640, 480, 'image/png', 4, 1, 1, 'embedded', '1', 'deadbeef', 'cover art', ?)`,
  ).run(blobPath, Buffer.from([9, 9, 9]));
  db.prepare(
    `INSERT INTO concept (id, name, type, description) VALUES (1, 'Wander', 'character', 'The protagonist.')`,
  ).run();
  db.prepare(`INSERT INTO concept_surface (id, concept_id, surface) VALUES (1, 1, 'Wander')`).run();
  db.prepare(
    `INSERT INTO concept_mention (id, concept_id, surface_id, page_id, start_offset, end_offset)
     VALUES (1, 1, 1, 1, 0, 6)`,
  ).run();
  // Opt-in: quote data + a quote-less page (the Plate's fallback subject).
  if (withQuotes) {
    // A second page with NO quote, so the Plate's "passage" fallback has a subject.
    db.prepare(
      `INSERT INTO document_page (id, book_id, page_no, text, scanned, extractor_version, source_sha256)
       VALUES (2, 1, 2, 'The Forbidden Lands stretch beyond the bridge.', 0, '1', 'deadbeef')`,
    ).run();
    db.prepare(
      `INSERT INTO image (id, sha256, path, w, h, mime, bytes, book_id, page_no, kind, extractor_version, source_sha256, caption, thumb)
       VALUES (2, 'beefca', ?, 640, 480, 'image/png', 4, 1, 2, 'embedded', '1', 'deadbeef', NULL, NULL)`,
    ).run(blobPath);
    // v4/v5 quote data: one strong quote on page 1, one weak (below the display cut),
    // and a v5 checkpoint proving the page was extracted.
    db.prepare(
      `INSERT INTO quote (id, page_id, start_offset, end_offset, text, score, kind, extractor_version, model_id, source_sha256)
       VALUES (1, 1, 0, 35, 'Wander enters the Forbidden Lands.', 0.95, 'observation', '1', 'deepseek', 'deadbeef')`,
    ).run();
    db.prepare(
      `INSERT INTO quote (id, page_id, start_offset, end_offset, text, score, kind, extractor_version, model_id, source_sha256)
       VALUES (2, 1, 9, 25, 'the Forbidden Lands.', 0.62, 'statement', '1', 'deepseek', 'deadbeef')`,
    ).run();
    db.prepare(
      `INSERT INTO quote_concept (quote_id, concept_id, confidence) VALUES (1, 1, 0.9)`,
    ).run();
    db.prepare(
      `INSERT INTO quote_page (page_id, source_sha256, extractor_version, extracted_at)
       VALUES (1, 'deadbeef', '1', '2026-10-19')`,
    ).run();
  }

  // A merged duplicate: concept 2 resolves to 1.
  db.prepare(
    `INSERT INTO concept (id, name, type, description) VALUES (2, 'The Wanderer', 'character', NULL)`,
  ).run();
  db.prepare(`INSERT INTO concept_resolution (concept_id, resolved_id) VALUES (2, 1)`).run();
  db.close();

  return {
    dir,
    dbPath,
    imagesDir,
    blobPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** A fake index that records the args it was called with. */
export function makeFakeIndex(rowsByMode = {}) {
  const calls = [];
  return {
    calls,
    async count() {
      return 3;
    },
    async hybridSearch(args) {
      calls.push({ method: "hybrid", ...args });
      return rowsByMode.hybrid ?? [];
    },
    async vectorSearch(args) {
      calls.push({ method: "vector", ...args });
      return rowsByMode.vector ?? [];
    },
    async textSearch(args) {
      calls.push({ method: "text", ...args });
      return rowsByMode.text ?? [];
    },
    async getVector(id) {
      calls.push({ method: "getVector", id });
      return rowsByMode.vectors?.[id] ?? null;
    },
  };
}

// The typed shape `LanceIndex` returns (src/lib/server/index.js#shapeHit).
export const sampleRows = [
  { id: "text:1", kind: "text", bookId: 1, pageId: 1, text: "Wander enters", score: 0.9, distance: null },
  { id: "concept:1", kind: "concept", bookId: null, pageId: null, text: "Wander", score: 0.5, distance: null },
  { id: "image:1", kind: "image", bookId: 1, pageId: 3, text: null, score: 0.3, distance: null },
];
