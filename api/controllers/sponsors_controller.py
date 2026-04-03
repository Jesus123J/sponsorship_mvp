"""Logica de negocio — sponsors."""
from api.database import fetch_all, fetch_one, execute


def list_sponsors() -> list:
    """Lista todos los sponsors ordenados por tier."""
    return fetch_all("SELECT * FROM sponsors ORDER BY tier_mvp, nombre")


def create_sponsor(sponsor_id: str, nombre: str, categoria: str, tier_mvp: int) -> dict:
    """Crea un sponsor nuevo. Retorna error si ya existe."""
    existing = fetch_one("SELECT sponsor_id FROM sponsors WHERE sponsor_id = %s", (sponsor_id,))
    if existing:
        return {"error": f"El sponsor '{sponsor_id}' ya existe", "status": 409}

    execute(
        "INSERT INTO sponsors (sponsor_id, nombre, categoria, tier_mvp, temporada) "
        "VALUES (%s, %s, %s, %s, 2025)",
        (sponsor_id, nombre, categoria, tier_mvp),
    )
    return {"message": f"Sponsor '{sponsor_id}' creado", "sponsor_id": sponsor_id}


def get_sponsor(sponsor_id: str) -> dict | None:
    """Detalle de un sponsor."""
    return fetch_one("SELECT * FROM sponsors WHERE sponsor_id = %s", (sponsor_id,))


def get_smv(sponsor_id: str, match_id: str = None) -> list:
    """SMV desglosado por entidad, posicion y contexto."""
    query = (
        "SELECT d.entity_id, d.position_type, d.context_type, d.localidad, "
        "d.match_id, SUM(d.smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones d WHERE d.aprobada = 1 AND d.sponsor_id = %s "
    )
    params = [sponsor_id]
    if match_id:
        query += "AND d.match_id = %s "
        params.append(match_id)
    query += "GROUP BY d.entity_id, d.position_type, d.context_type, d.localidad, d.match_id ORDER BY smv DESC"

    rows = fetch_all(query, tuple(params))
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


def get_menciones(sponsor_id: str, match_id: str = None) -> list:
    """Menciones de audio de un sponsor."""
    query = "SELECT * FROM menciones_audio WHERE sponsor_id = %s "
    params = [sponsor_id]
    if match_id:
        query += "AND match_id = %s "
        params.append(match_id)
    query += "ORDER BY match_id, timestamp_seg"
    return fetch_all(query, tuple(params))


def get_summary(sponsor_id: str) -> dict:
    """Resumen: SMV total, detecciones, partidos, segundos."""
    row = fetch_one(
        "SELECT COUNT(*) as detecciones, "
        "COALESCE(SUM(smv_parcial), 0) as smv_total, "
        "COUNT(DISTINCT match_id) as partidos "
        "FROM detecciones WHERE aprobada = 1 AND sponsor_id = %s",
        (sponsor_id,),
    )
    if row:
        row["smv_total"] = float(row["smv_total"] or 0)
        row["segundos"] = row["detecciones"]
    return row


def get_by_match(sponsor_id: str) -> list:
    """SMV desglosado por partido."""
    rows = fetch_all(
        "SELECT match_id, SUM(smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones WHERE aprobada = 1 AND sponsor_id = %s "
        "GROUP BY match_id ORDER BY smv DESC",
        (sponsor_id,),
    )
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


def get_by_position(sponsor_id: str) -> list:
    """SMV desglosado por posicion."""
    rows = fetch_all(
        "SELECT position_type, SUM(smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones WHERE aprobada = 1 AND sponsor_id = %s "
        "GROUP BY position_type ORDER BY smv DESC",
        (sponsor_id,),
    )
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows
