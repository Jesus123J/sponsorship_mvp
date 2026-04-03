"""Logica de negocio — detecciones (CORE)."""
import math
from api.database import fetch_all, fetch_one


def _build_filters(match_id=None, position_type=None, match_period=None, entity_id=None) -> tuple:
    """Construye clausulas WHERE y params a partir de filtros opcionales."""
    clauses = []
    params = []
    if match_id:
        clauses.append("AND d.match_id = %s")
        params.append(match_id)
    if position_type:
        clauses.append("AND d.position_type = %s")
        params.append(position_type)
    if match_period:
        clauses.append("AND d.match_period = %s")
        params.append(match_period)
    if entity_id:
        clauses.append("AND d.entity_id = %s")
        params.append(entity_id)
    return " ".join(clauses), params


def _paginate(total: int, page: int, per_page: int) -> dict:
    """Genera metadata de paginacion."""
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 0,
    }


def _float_smv(rows: list, key: str = "smv") -> list:
    """Convierte campo smv a float en todas las filas."""
    for r in rows:
        r[key] = float(r[key] or 0)
    return rows


def get_league(match_id=None, position_type=None, match_period=None, page=1, per_page=50) -> dict:
    """Detecciones agrupadas por sponsor para League View."""
    filters, params = _build_filters(match_id, position_type, match_period)

    count_q = f"SELECT COUNT(DISTINCT d.sponsor_id) as total FROM detecciones d WHERE d.aprobada = 1 AND d.entity_id = 'liga_1' {filters}"
    total = fetch_one(count_q, tuple(params) if params else None)["total"]

    offset = (page - 1) * per_page
    data_q = (
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv, "
        "COUNT(*) as detecciones, COUNT(*) as segundos "
        "FROM detecciones d JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        f"WHERE d.aprobada = 1 AND d.entity_id = 'liga_1' {filters} "
        "GROUP BY d.sponsor_id, s.nombre ORDER BY smv DESC LIMIT %s OFFSET %s"
    )
    rows = fetch_all(data_q, tuple(params + [per_page, offset]))

    return {"data": _float_smv(rows), **_paginate(total, page, per_page)}


def get_property(entity_id, match_id=None, position_type=None, page=1, per_page=50) -> dict:
    """Detecciones agrupadas por sponsor para Property View."""
    filters, params = _build_filters(match_id, position_type)
    base_params = [entity_id] + params

    count_q = f"SELECT COUNT(DISTINCT d.sponsor_id) as total FROM detecciones d WHERE d.aprobada = 1 AND d.entity_id = %s {filters}"
    total = fetch_one(count_q, tuple(base_params))["total"]

    offset = (page - 1) * per_page
    data_q = (
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv, "
        "COUNT(*) as detecciones, "
        "SUM(CASE WHEN d.localidad = 'local' THEN 1 ELSE 0 END) as local_count, "
        "SUM(CASE WHEN d.localidad = 'visitante' THEN 1 ELSE 0 END) as visit_count "
        "FROM detecciones d JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        f"WHERE d.aprobada = 1 AND d.entity_id = %s {filters} "
        "GROUP BY d.sponsor_id, s.nombre ORDER BY smv DESC LIMIT %s OFFSET %s"
    )
    rows = fetch_all(data_q, tuple(base_params + [per_page, offset]))

    return {"data": _float_smv(rows), **_paginate(total, page, per_page)}


def get_brand(sponsor_id, match_id=None, entity_id=None, position_type=None, page=1, per_page=50) -> dict:
    """Detecciones desglosadas para Brand View."""
    filters, params = _build_filters(match_id, position_type, entity_id=entity_id)
    base_params = [sponsor_id] + params

    count_q = (
        "SELECT COUNT(*) as total FROM ("
        "SELECT 1 FROM detecciones d "
        f"WHERE d.aprobada = 1 AND d.sponsor_id = %s {filters} "
        "GROUP BY d.entity_id, d.position_type, d.context_type, d.localidad, d.match_id"
        ") sub"
    )
    total = fetch_one(count_q, tuple(base_params))["total"]

    offset = (page - 1) * per_page
    data_q = (
        "SELECT d.entity_id, d.position_type, d.context_type, d.localidad, "
        "d.match_id, SUM(d.smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones d "
        f"WHERE d.aprobada = 1 AND d.sponsor_id = %s {filters} "
        "GROUP BY d.entity_id, d.position_type, d.context_type, d.localidad, d.match_id "
        "ORDER BY smv DESC LIMIT %s OFFSET %s"
    )
    rows = fetch_all(data_q, tuple(base_params + [per_page, offset]))

    return {"data": _float_smv(rows), **_paginate(total, page, per_page)}


def get_menciones(sponsor_id=None, match_id=None) -> list:
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
