from sqlalchemy import Column, Integer, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class DeadActor(Base):
    __tablename__ = "dead_actors"
    person_id = Column(Integer, primary_key=True)
    birth = Column(Text, index=True)
    death = Column(Text, index=True)
    name = Column(Text, index=True)
