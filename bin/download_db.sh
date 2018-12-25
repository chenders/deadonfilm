#!/usr/bin/env bash

if [ "$TERM" != "screen" ]
  then
  echo "This can run for a very long time. Hit CTRL-C to cancel and re-run inside of a screen, otherwise hit enter."
  read
fi
mkdir imdb_tmp 2>/dev/null

DB_FILES=(name.basics.tsv.gz title.akas.tsv.gz title.basics.tsv.gz title.crew.tsv.gz title.episode.tsv.gz title.principals.tsv.gz title.ratings.tsv.gz)

cd imdb_tmp
for DB_FILE in "${DB_FILES[@]}"; do
    echo $DB_FILE
    wget -c -q -o /dev/null --show-progress https://datasets.imdbws.com/${DB_FILE}
done;
