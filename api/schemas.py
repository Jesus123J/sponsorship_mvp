"""Schemas Pydantic — validacion de inputs y tipado de responses."""
from pydantic import BaseModel, Field
from typing import Optional, Literal


# --- Auth ---
class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=4, max_length=100)


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    nombre: str = Field(..., min_length=2, max_length=100)
    sponsor_id: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# --- Sponsors ---
class CreateSponsorRequest(BaseModel):
    sponsor_id: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9_]+$")
    nombre: str = Field(..., min_length=2, max_length=100)
    categoria: str = ""
    tier_mvp: int = Field(3, ge=1, le=5)


# --- Detections filters ---
PositionType = Literal["camiseta", "valla_led", "overlay_digital", "cenefa", "panel_mediocampo"]
MatchPeriod = Literal["primera_mitad", "entretiempo", "segunda_mitad"]
ContextType = Literal["juego_vivo", "replay", "replay_gol", "comercial", "pre_partido", "post_partido"]


# --- Pagination ---
class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    per_page: int = Field(50, ge=1, le=200)


class PaginatedResponse(BaseModel):
    data: list
    total: int
    page: int
    per_page: int
    pages: int
