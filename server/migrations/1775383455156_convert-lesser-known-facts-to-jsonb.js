/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // PostgreSQL doesn't allow subqueries in ALTER COLUMN ... TYPE USING clauses.
  // Use a two-step approach: add new column, populate it, swap, drop old.
  pgm.sql(`
    ALTER TABLE actor_biography_details
    ADD COLUMN lesser_known_facts_new jsonb DEFAULT '[]'::jsonb
  `);
  pgm.sql(`
    UPDATE actor_biography_details
    SET lesser_known_facts_new = COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('text', elem, 'sourceUrl', null, 'sourceName', null))
       FROM unnest(lesser_known_facts) AS elem),
      '[]'::jsonb
    )
  `);
  pgm.sql(`ALTER TABLE actor_biography_details DROP COLUMN lesser_known_facts`);
  pgm.sql(`ALTER TABLE actor_biography_details RENAME COLUMN lesser_known_facts_new TO lesser_known_facts`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Convert back to text[], extracting just the text field
  pgm.sql(`
    ALTER TABLE actor_biography_details
    ADD COLUMN lesser_known_facts_old text[] DEFAULT NULL
  `);
  pgm.sql(`
    UPDATE actor_biography_details
    SET lesser_known_facts_old = ARRAY(
      SELECT elem->>'text'
      FROM jsonb_array_elements(COALESCE(lesser_known_facts, '[]'::jsonb)) AS elem
    )
  `);
  pgm.sql(`ALTER TABLE actor_biography_details DROP COLUMN lesser_known_facts`);
  pgm.sql(`ALTER TABLE actor_biography_details RENAME COLUMN lesser_known_facts_old TO lesser_known_facts`);
};
