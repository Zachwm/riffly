from backend.core.database import engine, Base
from backend.core import models  # ensures tables register
from backend.scripts.seed_db import seed_db


def reset_db():
    print("Resetting database...")

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("Tables created")

    seed_db()

    print("Done")


if __name__ == "__main__":
    reset_db()