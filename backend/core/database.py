import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Railway's Postgres plugin injects a full DATABASE_URL (host, port, user,
# password, db name all included) into any service it's linked to. Locally,
# .env can just set DATABASE_URL directly too -- this keeps one code path
# for both instead of reconstructing the URL from a bare password + a
# hardcoded localhost host, which only ever worked on your machine.
#
# POSTGRES_PASSWORD fallback keeps this working with zero .env changes if
# that's what you've already got set locally.
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
    DATABASE_URL = f"postgresql://postgres:{POSTGRES_PASSWORD}@localhost:5432/riffly"

# Railway's DATABASE_URL comes as "postgresql://...". SQLAlchemy's default
# driver handles that fine as long as psycopg2 is installed (it is, since
# that's what the original localhost URL above also relied on) -- so no
# scheme rewrite is actually needed here, just noting it in case you ever
# switch to an async driver later.

# pool_pre_ping matters more on a managed host than it did locally: managed
# Postgres can silently drop idle connections, and without this you'd get
# an occasional random error instead of a transparent reconnect.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()