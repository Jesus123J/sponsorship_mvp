"""Endpoints de detecciones — lee tabla detecciones (CORE)."""
from fastapi import APIRouter, Query
from api.database import fetch_all

router = APIRouter()


@router.get("/league")
def get_league_detections(
    match_id: str = None,
    position_type: str = None,
    match_period: str = None,
):
    """Detecciones agrupadas por sponsor para League View (entity_id = liga_1)."""
    query = (
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv, "
        "COUNT(*) as detecciones, COUNT(*) as segundos "
        "FROM detecciones d "
        "JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        "WHERE d.aprobada = 1 AND d.entity_id = 'liga_1' "
    )
    params = []

    if match_id:
        query += "AND d.match_id = %s "
        params.append(match_id)
    if position_type:
        query += "AND d.position_type = %s "
        params.append(position_type)
    if match_period:
        query += "AND d.match_period = %s "
        params.append(match_period)

    query += "GROUP BY d.sponsor_id, s.nombre ORDER BY smv DESC"
    rows = fetch_all(query, tuple(params) if params else None)
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


@router.get("/property/{entity_id}")
def get_property_detections(
    entity_id: str,
    match_id: str = None,
    position_type: str = None,
):
    """Detecciones agrupadas por sponsor para Property View (un club)."""
    query = (
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv, "
        "COUNT(*) as detecciones, "
        "SUM(CASE WHEN d.localidad = 'local' THEN 1 ELSE 0 END) as local_count, "
        "SUM(CASE WHEN d.localidad = 'visitante' THEN 1 ELSE 0 END) as visit_count "
        "FROM detecciones d "
        "JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        "WHERE d.aprobada = 1 AND d.entity_id = %s "
    )
    params = [entity_id]

    if match_id:
        query += "AND d.match_id = %s "
        params.append(match_id)
    if position_type:
        query += "AND d.position_type = %s "
        params.append(position_type)

    query += "GROUP BY d.sponsor_id, s.nombre ORDER BY smv DESC"
    rows = fetch_all(query, tuple(params))
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


@router.get("/brand/{sponsor_id}")
def get_brand_detections(
    sponsor_id: str,
    match_id: str = None,
    entity_id: str = None,
    position_type: str = None,
):
    """Detecciones desglosadas para Brand View (un sponsor)."""
    query = (
        "SELECT d.entity_id, d.position_type, d.context_type, d.localidad, "
        "d.match_id, SUM(d.smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones d "
        "WHERE d.aprobada = 1 AND d.sponsor_id = %s "
    )
    params = [sponsor_id]

    if match_id:
        query += "AND d.match_id = %s "
        params.append(match_id)
    if entity_id:
        query += "AND d.entity_id = %s "
        params.append(entity_id)
    if position_type:
        query += "AND d.position_type = %s "
        params.append(position_type)

    query += (
        "GROUP BY d.entity_id, d.position_type, d.context_type, d.localidad, d.match_id "
        "ORDER BY smv DESC"
    )
    rows = fetch_all(query, tuple(params))
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


@router.get("/menciones")
def get_menciones(sponsor_id: str = None, match_id: str = None):
    """Menciones de audio con filtros opcionales."""
    query = "SELECT * FROM menciones_audio WHERE 1=1 "
    params = []
    if sponsor_id:
        query += "AND sponsor_id = %s "
        params.append(sponsor_id)
    if match_id:
        query += "AND match_id = %s "
        params.append(match_id)
    query += "ORDER BY match_id, timestamp_seg"
    return fetch_all(query, tuple(params) if params else None)
