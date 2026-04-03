"""Logica de negocio — partidos."""
from api.database import fetch_all, fetch_one


def list_matches() -> list:
    """Lista todos los partidos con nombres de equipos."""
    return fetch_all(
        "SELECT p.*, "
        "el.nombre_corto as local_nombre, ev.nombre_corto as visitante_nombre "
        "FROM partidos p "
        "LEFT JOIN entidades el ON p.equipo_local = el.entity_id "
        "LEFT JOIN entidades ev ON p.equipo_visitante = ev.entity_id "
        "ORDER BY p.fecha DESC"
    )


def get_match(match_id: str) -> dict | None:
    """Detalle de un partido."""
    return fetch_one(
        "SELECT p.*, "
        "el.nombre_corto as local_nombre, ev.nombre_corto as visitante_nombre "
        "FROM partidos p "
        "LEFT JOIN entidades el ON p.equipo_local = el.entity_id "
        "LEFT JOIN entidades ev ON p.equipo_visitante = ev.entity_id "
        "WHERE p.match_id = %s",
        (match_id,),
    )


def get_match_sponsors(match_id: str) -> list:
    """Ranking de sponsors en un partido por SMV."""
    rows = fetch_all(
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv, "
        "COUNT(*) as detecciones "
        "FROM detecciones d "
        "JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        "WHERE d.match_id = %s AND d.aprobada = 1 "
        "GROUP BY d.sponsor_id, s.nombre ORDER BY smv DESC",
        (match_id,),
    )
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows
