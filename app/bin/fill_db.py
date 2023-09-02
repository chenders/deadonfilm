#!/usr/bin/env python3
import requests
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import Session
from tqdm import tqdm
import zlib
import csv
import os.path
import psycopg2.extras

from ..models import DeadActor

DOWNLOAD_URL = "https://datasets.imdbws.com/name.basics.tsv.gz"
OUTPUT_FILENAME = "name.basics.tsv"
engine = create_engine(
    os.environ.get("DATABASE_URL", "postgresql+psycopg2://localhost/food")
)
conn = engine.connect()

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
DeadActor.__table__.drop(engine, checkfirst=True)
DeadActor.__table__.create(engine)
print("Table created successfully")

print("Updating database...")
rows = []
with open("./name.basics.tsv", "r") as csvfile:
    reader = csv.DictReader(csvfile, delimiter="\t")
    with tqdm(total=lines) as progress_bar:
        for row in reader:
            progress_bar.update(1)
            for key in row.keys():
                if row[key] == r"\N":
                    row[key] = ""

            if row["deathYear"].strip() != "":
                rows.append(
                    {
                        "person_id": row["nconst"].replace("nm", ""),
                        "birth": row["birthYear"],
                        "death": row["deathYear"],
                        "name": row["primaryName"],
                    }
                )
with Session(engine) as session:
    session.execute(insert(DeadActor.__table__), rows)
    session.commit()


os.remove(OUTPUT_FILENAME)
print("Done!")
