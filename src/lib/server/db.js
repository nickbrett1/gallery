// The ONLY module that opens SQLite. Opened READ-ONLY (reader owns the writes),
// WAL-tolerant, with `query_only` on as a belt-and-braces guard. The
// `schema_version` check runs at startup and fails loudly on a mismatch.

import Database from "better-sqlite3";

import { SCHEMA_VERSION, SchemaMismatchError } from "./schema.js";

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
