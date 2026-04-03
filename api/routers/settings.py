"""Endpoints de configuracion — lee parametros, multiplicadores, entidades."""
from fastapi import APIRouter
from api.database import fetch_all

router = APIRouter()


@router.get("/parametros")
def get_parametros():
    """Parametros de valoracion (CPM, audiencia, etc)."""
    return fetch_all("SELECT * FROM parametros_valoracion ORDER BY temporada DESC")


@router.get("/multiplicadores")
def get_multiplicadores():
    """Multiplicadores de contexto."""
    return fetch_all("SELECT * FROM multiplicadores_contexto ORDER BY context_type")


@router.get("/entidades")
def get_entidades():
    """Entidades activas (clubes + liga)."""
    return fetch_all("SELECT * FROM entidades WHERE activo = 1 ORDER BY entity_type, nombre_corto")


@router.get("/entidades/clubs")
def get_clubs():
    """Solo clubes (sin liga)."""
    return fetch_all(
        "SELECT * FROM entidades WHERE activo = 1 AND entity_type = 'club' ORDER BY nombre_corto"
    )


@router.get("/labeling-guide")
def get_labeling_guide():
    """Guia de etiquetado: sponsor_id exactos para usar en Label Studio."""
    sponsors = fetch_all(
        "SELECT sponsor_id, nombre, categoria, tier_mvp FROM sponsors ORDER BY tier_mvp, nombre"
    )
    return {
        "instrucciones": "Usa estos EXACTOS sponsor_id como nombre de etiqueta en Label Studio. No inventes nombres.",
        "total": len(sponsors),
        "sponsors": sponsors,
    }
