"""Logica de negocio — estadisticas del dashboard."""
from api.database import fetch_all, fetch_one


def get_stats() -> dict:
    """Estadisticas generales: partidos, detecciones, sponsors, SMV total."""
    partidos = fetch_one("SELECT COUNT(*) as total FROM partidos")
    sponsors = fetch_one("SELECT COUNT(*) as total FROM sponsors")
    detecciones = fetch_one(
        "SELECT COUNT(*) as total, COALESCE(SUM(smv_parcial), 0) as smv_total "
        "FROM detecciones WHERE aprobada = 1"
    )
    return {
        "partidos": partidos["total"] if partidos else 0,
        "sponsors": sponsors["total"] if sponsors else 0,
        "detecciones": detecciones["total"] if detecciones else 0,
        "smv_total": float(detecciones["smv_total"]) if detecciones else 0,
    }


def get_top_sponsors(limit: int = 5) -> list:
    """Top sponsors por SMV total."""
    rows = fetch_all(
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv_total, COUNT(*) as detecciones "
        "FROM detecciones d "
        "JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        "WHERE d.aprobada = 1 "
        "GROUP BY d.sponsor_id, s.nombre "
        "ORDER BY smv_total DESC LIMIT %s",
        (limit,),
    )
    for r in rows:
        r["smv_total"] = float(r["smv_total"] or 0)
    return rows
