from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

# Pool sizing: streaming endpoints release their request session before the
# SSE stream starts (see app/services/chat.py), so connections are held only
# for the short pre-stream setup. 10+20 per worker keeps 2 workers well under
# a default Postgres max_connections of 100. pool_recycle guards against
# PaaS-side idle connection reaping.
engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
