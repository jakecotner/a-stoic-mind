"""Org module shapes (orgs/RBAC module — delete with it). Response models
use Literal roles because they define the generated frontend types."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Role = Literal["owner", "admin", "member"]
# What an invite can grant — ownership is never assignable through the API.
InviteRole = Literal["admin", "member"]


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OrgOut(BaseModel):
    """An organization as seen by one of its members — carries the CALLER's
    role, which is what every screen needs to decide what to render."""

    id: uuid.UUID
    name: str
    created_at: datetime
    role: Role


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    role: Role
    created_at: datetime


class RoleUpdate(BaseModel):
    role: InviteRole


class InviteCreate(BaseModel):
    email: EmailStr
    role: InviteRole = "member"


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: InviteRole
    created_at: datetime
    expires_at: datetime


class AcceptInviteRequest(BaseModel):
    token: str = Field(min_length=1, max_length=64)
