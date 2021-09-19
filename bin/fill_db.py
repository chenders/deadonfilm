#!/usr/bin/env python3
import requests
from tqdm import tqdm
import zlib
import csv
import os.path
import psycopg2.extras
from urllib.parse import urlparse

DOWNLOAD_URL = "https://datasets.imdbws.com/name.basics.tsv.gz"
OUTPUT_FILENAME = "name.basics.tsv"
DB_URL = urlparse(os.environ.get("IMDB_DB", "postgresql://localhost/imdb"))

d = zlib.decompressobj(16 + zlib.MAX_WBITS)
print("Downloading updated file..")

lines = 0
with requests.get(DOWNLOAD_URL, stream=True) as response:
    response.raise_for_status()
    with tqdm(
        # all optional kwargs
        unit="B",
        unit_scale=True,
        unit_divisor=1024,
        miniters=1,
        total=int(response.headers.get("content-length", 0)),
    ) as progress_bar:
        with open("./name.basics.tsv", "wb") as file:
            for chunk in response.iter_content(chunk_size=4096):
                chunk_data = d.decompress(chunk)
                lines += chunk_data.decode("utf-8", errors="ignore").count("\n")
                file.write(chunk_data)
                progress_bar.update(len(chunk))
print(f"Found {lines} names")
conn = psycopg2.connect(
    database=DB_URL.path[1:],
    user=DB_URL.username,
    password=DB_URL.password,
    host=DB_URL.hostname,
    port=DB_URL.port,
)
conn.autocommit = True
cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
cursor.execute(
    """CREATE TABLE IF NOT EXISTS dead_actors (
  person_id integer unique,
  birth text,
  death text,
  name text
)"""
)
print("Updating database...")
with open("./name.basics.tsv", "r") as csvfile:
    reader = csv.DictReader(csvfile, delimiter="\t")
    with tqdm(total=lines) as progress_bar:
        for row in reader:
            progress_bar.update(1)
            for key in row.keys():
                if row[key] == r"\N":
                    row[key] = ""

            if row["deathYear"].strip() != "":
                cursor.execute(
                    """INSERT INTO dead_actors
          (person_id, birth, death, name)
        VALUES
          (%s, %s, %s, %s)
        ON CONFLICT (person_id) DO NOTHING """,
                    (
                        (
                            row["nconst"].replace("nm", ""),
                            row["birthYear"],
                            row["deathYear"],
                            row["primaryName"],
                        )
                    ),
                )
os.remove(OUTPUT_FILENAME)
print("Done!")
