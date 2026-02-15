/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * Create tables for storing historical Google Search Console data.
 * GSC only retains 16 months of data, so we snapshot daily for long-term trends.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // Daily search performance snapshots (aggregate totals)
  pgm.createTable("gsc_search_performance", {
    id: "id",
    date: { type: "date", notNull: true },
    search_type: { type: "varchar(20)", notNull: true, default: "web" },
    clicks: { type: "integer", notNull: true, default: 0 },
    impressions: { type: "integer", notNull: true, default: 0 },
    ctr: { type: "numeric(6,4)", notNull: true, default: 0 },
    position: { type: "numeric(6,2)", notNull: true, default: 0 },
    fetched_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  })

  pgm.addConstraint("gsc_search_performance", "uq_gsc_search_performance_date_type", {
    unique: ["date", "search_type"],
  })

  pgm.createIndex("gsc_search_performance", "date")

  // Top queries snapshots (daily top N queries)
  pgm.createTable("gsc_top_queries", {
    id: "id",
    date: { type: "date", notNull: true },
    query: { type: "text", notNull: true },
    clicks: { type: "integer", notNull: true, default: 0 },
    impressions: { type: "integer", notNull: true, default: 0 },
    ctr: { type: "numeric(6,4)", notNull: true, default: 0 },
    position: { type: "numeric(6,2)", notNull: true, default: 0 },
    fetched_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  })

  pgm.addConstraint("gsc_top_queries", "uq_gsc_top_queries_date_query", {
    unique: ["date", "query"],
  })

  pgm.createIndex("gsc_top_queries", "date")

  // Top pages snapshots (daily top N pages)
  pgm.createTable("gsc_top_pages", {
    id: "id",
    date: { type: "date", notNull: true },
    page_url: { type: "text", notNull: true },
    page_type: { type: "varchar(50)", notNull: true, default: "other" },
    clicks: { type: "integer", notNull: true, default: 0 },
    impressions: { type: "integer", notNull: true, default: 0 },
    ctr: { type: "numeric(6,4)", notNull: true, default: 0 },
    position: { type: "numeric(6,2)", notNull: true, default: 0 },
    fetched_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  })

  pgm.addConstraint("gsc_top_pages", "uq_gsc_top_pages_date_url", {
    unique: ["date", "page_url"],
  })

  pgm.createIndex("gsc_top_pages", "date")
  pgm.createIndex("gsc_top_pages", "page_type")

  // Page type performance snapshots (daily aggregates by type)
  pgm.createTable("gsc_page_type_performance", {
    id: "id",
    date: { type: "date", notNull: true },
    page_type: { type: "varchar(50)", notNull: true },
    clicks: { type: "integer", notNull: true, default: 0 },
    impressions: { type: "integer", notNull: true, default: 0 },
    ctr: { type: "numeric(6,4)", notNull: true, default: 0 },
    position: { type: "numeric(6,2)", notNull: true, default: 0 },
    fetched_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  })

  pgm.addConstraint("gsc_page_type_performance", "uq_gsc_page_type_date_type", {
    unique: ["date", "page_type"],
  })

  pgm.createIndex("gsc_page_type_performance", "date")

  // Indexing status snapshots (track indexed page counts over time)
  pgm.createTable("gsc_indexing_status", {
    id: "id",
    date: { type: "date", notNull: true, unique: true },
    total_submitted: { type: "integer", notNull: true, default: 0 },
    total_indexed: { type: "integer", notNull: true, default: 0 },
    index_details: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    fetched_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  })

  // Alerts table for tracking SEO issues
  pgm.createTable("gsc_alerts", {
    id: "id",
    alert_type: { type: "varchar(50)", notNull: true },
    severity: { type: "varchar(20)", notNull: true, default: "warning" },
    message: { type: "text", notNull: true },
    details: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    acknowledged: { type: "boolean", notNull: true, default: false },
    acknowledged_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  })

  pgm.createIndex("gsc_alerts", ["acknowledged", "created_at"])
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable("gsc_alerts")
  pgm.dropTable("gsc_indexing_status")
  pgm.dropTable("gsc_page_type_performance")
  pgm.dropTable("gsc_top_pages")
  pgm.dropTable("gsc_top_queries")
  pgm.dropTable("gsc_search_performance")
}
