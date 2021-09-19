#!/usr/bin/env bash
# This dumps all the downloaded files into `imdb_tmp`
./download_db.sh
s32imdbpy.py --verbose imdb_tmp/ postgresql://chris@localhost/imdb
