"""Logica de negocio — configuracion y parametros."""
from api.database import fetch_all


def get_parametros() -> list:
    """Parametros de valoracion (CPM, audiencia, etc)."""
    return fetch_all("SELECT * FROM parametros_valoracion ORDER BY temporada DESC")


def get_multiplicadores() -> list:
    """Multiplicadores de contexto."""
    return fetch_all("SELECT * FROM multiplicadores_contexto ORDER BY context_type")


def get_entidades() -> list:
    """Entidades activas (clubes + liga)."""
    return fetch_all("SELECT * FROM entidades WHERE activo = 1 ORDER BY entity_type, nombre_corto")


def get_clubs() -> list:
    """Solo clubes (sin liga)."""
    return fetch_all(
        "SELECT * FROM entidades WHERE activo = 1 AND entity_type = 'club' ORDER BY nombre_corto"
    )


def get_labeling_guide() -> dict:
    """Guia de etiquetado para Label Studio."""
    sponsors = fetch_all(
        "SELECT sponsor_id, nombre, categoria, tier_mvp FROM sponsors ORDER BY tier_mvp, nombre"
    )
    return {
        "instrucciones": "Usa estos EXACTOS sponsor_id como nombre de etiqueta en Label Studio.",
        "total": len(sponsors),
        "sponsors": sponsors,
    }
