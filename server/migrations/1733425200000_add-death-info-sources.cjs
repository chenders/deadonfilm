/**
 * Migration to add source tracking columns for cause of death information.
 * Tracks whether cause_of_death and cause_of_death_details came from 'claude' or 'wikipedia'.
 */

exports.up = (pgm) => {
  pgm.addColumn('deceased_persons', {
    cause_of_death_source: { type: 'text' },
    cause_of_death_details_source: { type: 'text' }
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('deceased_persons', 'cause_of_death_source');
  pgm.dropColumn('deceased_persons', 'cause_of_death_details_source');
};
