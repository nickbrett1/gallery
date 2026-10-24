// The ONLY module that opens SQLite. Opened READ-ONLY (reader owns the writes),
// WAL-tolerant, with `query_only` on as a belt-and-braces guard. The
// `schema_version` check runs at startup and fails loudly on a mismatch.

import Database from "better-sqlite3";

import { SCHEMA_VERSION, SchemaMismatchError } from "./schema.js";

/**
 * The score at which a quote stops being a candidate and starts being
 * displayable. Calibrated against 91 human verdicts on the live corpus:
 * score >= 0.94 gives ~92% precision (260 quotes); the Jev threshold of 0.69
 * gives 303. Everything below this is a candidate pool, not a selection, and
 * the UI must not present it as editorial choice.
 */
export const QUOTE_DISPLAY_SCORE = 0.69;

export function openDb(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  // reader writes in WAL mode; reading a WAL db read-only is fine, but a busy
  // writer should not make a read throw.
  db.pragma("busy_timeout = 5000");
  return db;
}

export function readSchemaInfo(db) {
  return (
    db
      .prepare(
        `SELECT version, applied_at, embedding_dimensions, embedding_model, embed_config_version
           FROM schema_version ORDER BY version DESC LIMIT 1`,
      )
      .get() || null
  );
}

export function checkSchema(db) {
  const info = readSchemaInfo(db);
  if (!info) {
    throw new SchemaMismatchError("schema_version table is empty or missing");
  }
  if (info.version !== SCHEMA_VERSION) {
    throw new SchemaMismatchError(
      `database schema is v${info.version}, gallery was built for v${SCHEMA_VERSION}`,
    );
  }
  return info;
}

const WALL_ORDER = `ORDER BY book_id, page_no, id`;

/**
 * A wall cursor is the last row of the previous page: `<book>:<page>:<id>`.
 * Keyset paging needs all three because the reading order is the triple.
 */
export function parseWallCursor(value) {
  if (value == null || value === "") return null;
  const m = /^(\d+):(\d+):(\d+)$/.exec(String(value));
  if (!m) {
    throw new TypeError(`wall cursor must look like <book>:<page>:<id>, got ${JSON.stringify(value)}`);
  }
  return { bookId: Number(m[1]), pageNo: Number(m[2]), id: Number(m[3]) };
}

export function formatWallCursor(row) {
  return `${row.book_id}:${row.page_no ?? 0}:${row.id}`;
}

/** Read-only view over the record. One prepared statement per access pattern. */
export class Store {
  constructor(dbPath) {
    this.db = openDb(dbPath);
    this._prep = new Map();
  }

  _q(sql) {
    let stmt = this._prep.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this._prep.set(sql, stmt);
    }
    return stmt;
  }

  checkSchema() {
    return checkSchema(this.db);
  }

  close() {
    this.db.close();
  }

  // --- works ---------------------------------------------------------------

  listBooks() {
    return this._q(
      `SELECT id, work_key, title, author, format FROM book ORDER BY title, id`,
    ).all();
  }

  getBook(id) {
    return (
      this._q(
        `SELECT id, work_key, title, author, format, source_path, source_sha256, added_at
           FROM book WHERE id = ?`,
      ).get(id) || null
    );
  }

  pagesForBook(bookId) {
    return this._q(
      `SELECT id, page_no, scanned, length(text) AS chars
         FROM document_page WHERE book_id = ? ORDER BY page_no`,
    ).all(bookId);
  }

  getPage(pageId) {
    return (
      this._q(
        `SELECT id, book_id, page_no, text, scanned FROM document_page WHERE id = ?`,
      ).get(pageId) || null
    );
  }

  imagesForBook(bookId) {
    return this._q(
      `SELECT id, sha256, w, h, mime, bytes, page_no, kind, caption,
              (thumb IS NOT NULL) AS has_thumb
         FROM image WHERE book_id = ? ORDER BY page_no, id`,
    ).all(bookId);
  }

  /**
   * The derived cover: the first image for a book in reading order
   * (`page_no, id`). There is no cover column in the schema and none is
   * invented — the cover is just the first image, or null when a work has none.
   */
  coverForBook(bookId) {
    return (
      this._q(
        `SELECT id, sha256, w, h, mime, bytes, page_no, kind, caption,
                (thumb IS NOT NULL) AS has_thumb
           FROM image WHERE book_id = ? ORDER BY page_no, id LIMIT 1`,
      ).get(bookId) || null
    );
  }

  // --- images --------------------------------------------------------------

  countImages() {
    return this._q(`SELECT COUNT(*) AS n FROM image`).get().n;
  }

  listImages({ limit = 60, offset = 0, bookId = null } = {}) {
    if (bookId != null) {
      return this._q(
        `SELECT id, book_id, sha256, w, h, mime, bytes, page_no, kind, caption,
                (thumb IS NOT NULL) AS has_thumb
           FROM image WHERE book_id = ? ORDER BY page_no, id LIMIT ? OFFSET ?`,
      ).all(bookId, limit, offset);
    }
    return this._q(
      `SELECT id, book_id, sha256, w, h, mime, bytes, page_no, kind, caption,
              (thumb IS NOT NULL) AS has_thumb
         FROM image ORDER BY book_id, page_no, id LIMIT ? OFFSET ?`,
    ).all(limit, offset);
  }

  getImage(id) {
    return (
      this._q(
        `SELECT id, book_id, sha256, path, w, h, mime, bytes, page_no, kind,
                caption, thumb, extractor_version, source_sha256
           FROM image WHERE id = ?`,
      ).get(id) || null
    );
  }

  getImageThumb(id) {
    return (
      this._q(`SELECT mime, thumb FROM image WHERE id = ?`).get(id) || null
    );
  }

  /** Metadata for several images in one round trip (the Plate's strip). */
  imagesByIds(ids) {
    const list = (ids || []).filter((n) => Number.isInteger(n));
    if (list.length === 0) return [];
    const marks = list.map(() => "?").join(",");
    return this._q(
      `SELECT id, book_id, sha256, w, h, mime, bytes, page_no, kind, caption,
              (thumb IS NOT NULL) AS has_thumb
         FROM image WHERE id IN (${marks})`,
    ).all(...list);
  }

  /**
   * One keyset page of the Wall (contact sheet), in reading order
   * (`book_id, page_no, id`).
   *
   * Keyset, not OFFSET: `OFFSET n` walks the table on every scroll. The caller
   * pages by passing back the cursor of the last row it was given.
   */
  wallPage({ bookId = null, cursor = null, limit = 120 } = {}) {
    const cols = `id, book_id, sha256, w, h, mime, bytes, page_no, kind, caption,
                  (thumb IS NOT NULL) AS has_thumb`;
    const after = parseWallCursor(cursor);
    let rows;
    if (bookId != null) {
      if (after) {
        rows = this._q(
          `SELECT ${cols} FROM image
            WHERE book_id = ? AND (page_no > ? OR (page_no = ? AND id > ?))
            ${WALL_ORDER} LIMIT ?`,
        ).all(bookId, after.pageNo, after.pageNo, after.id, limit + 1);
      } else {
        rows = this._q(
          `SELECT ${cols} FROM image WHERE book_id = ? ${WALL_ORDER} LIMIT ?`,
        ).all(bookId, limit + 1);
      }
    } else if (after) {
      rows = this._q(
        `SELECT ${cols} FROM image
          WHERE book_id > ?
             OR (book_id = ? AND (page_no > ? OR (page_no = ? AND id > ?)))
          ${WALL_ORDER} LIMIT ?`,
      ).all(after.bookId, after.bookId, after.pageNo, after.pageNo, after.id, limit + 1);
    } else {
      rows = this._q(`SELECT ${cols} FROM image ${WALL_ORDER} LIMIT ?`).all(limit + 1);
    }
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      images: page,
      hasMore,
      nextCursor: hasMore && page.length ? formatWallCursor(page[page.length - 1]) : null,
    };
  }

  /** One image id at random — the Plate's "drift" entry. */
  randomImageId() {
    const row = this._q(`SELECT id FROM image ORDER BY RANDOM() LIMIT 1`).get();
    return row ? row.id : null;
  }

  // --- concepts ------------------------------------------------------------

  getConcept(id) {
    return (
      this._q(
        `SELECT id, name, type, description FROM concept WHERE id = ?`,
      ).get(id) || null
    );
  }

  /** Collapse a concept id to its surviving representative (derived table). */
  resolveConceptId(id) {
    const row = this._q(
      `SELECT resolved_id FROM concept_resolution WHERE concept_id = ?`,
    ).get(id);
    return row ? row.resolved_id : id;
  }

  conceptSurfaces(conceptId) {
    return this._q(
      `SELECT id, surface FROM concept_surface WHERE concept_id = ? ORDER BY surface`,
    ).all(conceptId);
  }

  /** Every citation behind a concept: mention -> surface -> page -> book. */
  conceptCitations(conceptId) {
    return this._q(
      `SELECT cm.id, cs.surface, dp.page_no, dp.id AS page_id,
              b.id AS book_id, b.title, b.work_key,
              cm.start_offset, cm.end_offset
         FROM concept_mention cm
         JOIN concept_surface cs ON cs.id = cm.surface_id
         JOIN document_page  dp ON dp.id = cm.page_id
         JOIN book           b  ON b.id  = dp.book_id
        WHERE cm.concept_id = ?
        ORDER BY b.title, dp.page_no, cm.start_offset`,
    ).all(conceptId);
  }

  /**
   * Concepts that co-occur on the same pages (the record holds no explicit
   * relation table, so this is the honest derived view of "appears with").
   */
  relatedConcepts(conceptId, limit = 24) {
    return this._q(
      `SELECT DISTINCT c.id, c.name, c.type
         FROM concept_mention m1
         JOIN concept_mention m2 ON m2.page_id = m1.page_id AND m2.concept_id != m1.concept_id
         JOIN concept c ON c.id = m2.concept_id
        WHERE m1.concept_id = ?
        ORDER BY c.name
        LIMIT ?`,
    ).all(conceptId, limit);
  }

  /**
   * Neighbours for the Constellation: co-occurrence with a count, not just a
   * DISTINCT list. `shared_pages` is the edge weight — it is the only relation
   * the record actually holds, so the UI calls it "appears with".
   */
  conceptNeighbours(conceptId, limit = 12) {
    return this._q(
      `SELECT c.id, c.name, c.type,
              COUNT(DISTINCT m2.page_id) AS shared_pages,
              (SELECT COUNT(*) FROM concept_mention x WHERE x.concept_id = c.id) AS mentions
         FROM concept_mention m1
         JOIN concept_mention m2
           ON m2.page_id = m1.page_id AND m2.concept_id != m1.concept_id
         JOIN concept c ON c.id = m2.concept_id
        WHERE m1.concept_id = ?
        GROUP BY c.id
        ORDER BY shared_pages DESC, mentions DESC, c.name
        LIMIT ?`,
    ).all(conceptId, limit);
  }

  /** How often a concept is mentioned (the centre node's size). */
  conceptMentions(conceptId) {
    return this._q(
      `SELECT COUNT(*) AS n FROM concept_mention WHERE concept_id = ?`,
    ).get(conceptId).n;
  }

  listConcepts({ limit = 200, offset = 0 } = {}) {
    return this._q(
      `SELECT c.id, c.name, c.type,
              (SELECT COUNT(*) FROM concept_mention m WHERE m.concept_id = c.id) AS mentions
         FROM concept c ORDER BY mentions DESC, c.name LIMIT ? OFFSET ?`,
    ).all(limit, offset);
  }

  // --- chunks (citations for search results) -------------------------------

  getChunk(id) {
    return (
      this._q(
        `SELECT ch.id, ch.page_id, ch.ordinal, ch.start_offset, ch.end_offset, ch.text,
                dp.page_no, dp.book_id, b.title, b.work_key
           FROM chunk ch
           JOIN document_page dp ON dp.id = ch.page_id
           JOIN book b ON b.id = dp.book_id
          WHERE ch.id = ?`,
      ).get(id) || null
    );
  }

  // --- quotes (schema v4/v5) -----------------------------------------------

  /**
   * Quotes on one page, strongest first.
   *
   * `quote` stores only `page_id` — page_no, book and work_key come from the
   * joins, because the record does not duplicate them onto the quote row.
   */
  quotesForPage(pageId, { limit = 5, minScore = QUOTE_DISPLAY_SCORE } = {}) {
    return this._q(
      `SELECT q.id, q.page_id, q.start_offset, q.end_offset, q.text, q.score, q.kind,
              q.rationale, q.extractor_version, q.model_id,
              dp.page_no, dp.book_id, b.title, b.work_key
         FROM quote q
         JOIN document_page dp ON dp.id = q.page_id
         JOIN book b ON b.id = dp.book_id
        WHERE q.page_id = ? AND q.score >= ?
        ORDER BY q.score DESC, q.id
        LIMIT ?`,
    ).all(pageId, minScore, limit);
  }

  /**
   * The page an image sits on. `image` has no `page_id` column (only
   * `book_id` + `page_no`), so the page is resolved through that pair.
   */
  pageForImage(imageId) {
    return (
      this._q(
        `SELECT dp.id AS page_id, i.page_no, i.book_id
           FROM image i
           LEFT JOIN document_page dp
             ON dp.book_id = i.book_id AND dp.page_no = i.page_no
          WHERE i.id = ?`,
      ).get(imageId) || null
    );
  }

  /** Quotes on the page an image was extracted from ([] when it has no page). */
  quotesForImage(imageId, opts = {}) {
    const page = this.pageForImage(imageId);
    if (!page || page.page_id == null) return [];
    return this.quotesForPage(page.page_id, opts);
  }

  /** Quotes linked to a concept via `quote_concept`, strongest first. */
  quotesForConcept(conceptId, { limit = 6, minScore = QUOTE_DISPLAY_SCORE } = {}) {
    return this._q(
      `SELECT q.id, q.page_id, q.start_offset, q.end_offset, q.text, q.score, q.kind,
              q.rationale, qc.confidence,
              dp.page_no, dp.book_id, b.title, b.work_key
         FROM quote_concept qc
         JOIN quote q ON q.id = qc.quote_id
         JOIN document_page dp ON dp.id = q.page_id
         JOIN book b ON b.id = dp.book_id
        WHERE qc.concept_id = ? AND q.score >= ?
        ORDER BY q.score DESC, q.id
        LIMIT ?`,
    ).all(conceptId, minScore, limit);
  }

  /** The concepts a quote was tagged with (the Plate's chips). */
  quoteConcepts(quoteId) {
    return this._q(
      `SELECT c.id, c.name, c.type, qc.confidence
         FROM quote_concept qc
         JOIN concept c ON c.id = qc.concept_id
        WHERE qc.quote_id = ?
        ORDER BY qc.confidence DESC, c.name`,
    ).all(quoteId);
  }

  /** Chips for several quotes in one query (`?` placeholders, no string splicing). */
  conceptsForQuotes(quoteIds) {
    if (!quoteIds || quoteIds.length === 0) return {};
    const marks = quoteIds.map(() => "?").join(",");
    const rows = this._q(
      `SELECT qc.quote_id, c.id, c.name, c.type, qc.confidence
         FROM quote_concept qc
         JOIN concept c ON c.id = qc.concept_id
        WHERE qc.quote_id IN (${marks})
        ORDER BY qc.confidence DESC, c.name`,
    ).all(...quoteIds);
    const byQuote = {};
    for (const { quote_id: qid, ...concept } of rows) {
      (byQuote[qid] ??= []).push(concept);
    }
    return byQuote;
  }

  /** Has reader run the quote extractor over this page (v5 checkpoint)? */
  quoteCheckpoint(pageId) {
    return (
      this._q(
        `SELECT page_id, extractor_version, extracted_at FROM quote_page WHERE page_id = ?`,
      ).get(pageId) || null
    );
  }

  // --- stats ---------------------------------------------------------------

  counts() {
    const one = (sql) => this._q(sql).get().n;
    return {
      books: one(`SELECT COUNT(*) AS n FROM book`),
      pages: one(`SELECT COUNT(*) AS n FROM document_page`),
      chunks: one(`SELECT COUNT(*) AS n FROM chunk`),
      images: one(`SELECT COUNT(*) AS n FROM image`),
      concepts: one(`SELECT COUNT(*) AS n FROM concept`),
    };
  }
}
