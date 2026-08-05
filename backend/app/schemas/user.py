import uuid

from fastapi_users import schemas as fastapi_users_schemas

from app.schemas.tradition import Tradition


class UserRead(fastapi_users_schemas.BaseUser[uuid.UUID]):
    # Home tradition. Set via PUT /api/traditions/mine (free users choose
    # once; changing again is Plus) — deliberately NOT on UserUpdate, which
    # would bypass that gate.
    tradition: Tradition


class UserCreate(fastapi_users_schemas.BaseUserCreate):
    pass


class UserUpdate(fastapi_users_schemas.BaseUserUpdate):
    pass
