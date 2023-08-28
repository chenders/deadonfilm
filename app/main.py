import os
from imdb import Cinemagoer
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from sqlalchemy import (
    create_engine,
    select,
)
from sqlalchemy.orm import Session
from starlette.requests import Request
from app.models import DeadActor


logger = logging.getLogger("deadonfilm")

db_url = os.environ.get("DATABASE_URL", "postgresql+psycopg2://@localhost/imdb")

engine = create_engine(db_url)
conn = engine.connect()

i = Cinemagoer()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def setup_logging():
    logger.setLevel(logging.INFO)


@app.get("/search/")
def search(movie_title: str):
    """
    Find movie by title search (using IMDb API).
    """
    logger.info("Searching for %s" % movie_title)
    m = i.search_movie(movie_title)
    return [
        {"value": movie["long imdb title"], "id": movie.getID()}
        for movie in m
        if movie.get("kind") == "movie"
    ]


@app.get("/died/")
async def died(movie_id: str):
    """
    What cast members of the movie with the given IMDb id are now dead?
    """
    movie = i.get_movie(movie_id, info=["full credits"])
    if movie is None:
        raise HTTPException(
            status_code=404, detail="Movie not found: {}".format(movie_id, 404)
        )
    else:
        actors = movie.data.get("cast", None)
        if actors is None:
            raise HTTPException(status_code=404, detail="No cast reported")
        else:
            actors_by_id = {}
            for actor in actors:
                actors_by_id[int(actor.getID())] = actor
        with Session(engine) as session:
            statement = select(DeadActor).filter(
                DeadActor.person_id.in_(actors_by_id.keys())
            )
            dead_people = []
            for person in session.scalars(statement).all():
                person_id = person.person_id
                character = str(actors_by_id[person_id].currentRole)
                dead_people.append(
                    {
                        "person_id": person.person_id,
                        "birth": person.birth,
                        "death": person.death,
                        "character": character,
                        "name": person.name,
                    }
                )
            return sorted(
                dead_people, key=lambda dead_person: dead_person["death"], reverse=True
            )
