"""Schemas Pydantic — validacion de inputs y tipado de responses."""
import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, Literal

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


# --- Auth ---
class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=4, max_length=128)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError('Email invalido')
        return v


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=8, max_length=128)
    nombre: str = Field(..., min_length=2, max_length=100)
    sponsor_id: Optional[str] = None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError('Email invalido')
        return v

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        # Politica de password: minimo 8 chars, al menos 1 letra y 1 numero
        if len(v) < 8:
            raise ValueError('Password debe tener al menos 8 caracteres')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password debe contener al menos una letra')
        if not re.search(r'\d', v):
            raise ValueError('Password debe contener al menos un numero')
        # Bloquear passwords comunes
        common = {'password', '12345678', 'qwerty12', 'demo2025', 'admin123', 'sponsor1'}
        if v.lower() in common:
            raise ValueError('Password demasiado comun, elige uno mas seguro')
        return v

    @field_validator('nombre')
    @classmethod
    def validate_nombre(cls, v: str) -> str:
        v = v.strip()
        # Solo letras, numeros, espacios y caracteres comunes
        if not re.match(r"^[\w\s.\-']+$", v, re.UNICODE):
            raise ValueError('Nombre contiene caracteres invalidos')
        return v


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
