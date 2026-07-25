# Empty on purpose

The template ships with NO migrations. The initial migration is generated
when a project is spawned, AFTER the module choices (teams/RBAC, chat,
billing — see MODULES.md) have been made, so every project's migration
history contains only the tables it actually uses:

    python -m alembic revision --autogenerate -m "initial schema"
    python -m alembic upgrade head

(Autogenerate only sees models imported in `app/models/__init__.py` — that
import list IS the module selection, as far as the schema is concerned.)

When developing the template itself, generate a throwaway initial migration
the same way but do not commit it.
