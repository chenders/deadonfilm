/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn("actor_death_info_history", {
    enrichment_version: {
      type: "text",
    },
  });

  pgm.createIndex("actor_death_info_history", "enrichment_version", {
    name: "idx_death_info_history_version",
    where: "enrichment_version IS NOT NULL",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("actor_death_info_history", "enrichment_version", {
    name: "idx_death_info_history_version",
  });
  pgm.dropColumn("actor_death_info_history", "enrichment_version");
};
