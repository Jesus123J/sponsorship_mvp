"""Endpoints de sponsors — lee tabla sponsors."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.database import fetch_all, fetch_one, get_connection

router = APIRouter()


class CreateSponsorRequest(BaseModel):
    sponsor_id: str
    nombre: str
    categoria: str = ""
    tier_mvp: int = 3


@router.get("/")
def list_sponsors():
    """Lista todos los sponsors ordenados por tier."""
    return fetch_all("SELECT * FROM sponsors ORDER BY tier_mvp, nombre")


@router.post("/")
def create_sponsor(req: CreateSponsorRequest):
    """Crea un sponsor nuevo."""
    existing = fetch_one("SELECT sponsor_id FROM sponsors WHERE sponsor_id = %s", (req.sponsor_id,))
    if existing:
        raise HTTPException(status_code=409, detail=f"El sponsor '{req.sponsor_id}' ya existe")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO sponsors (sponsor_id, nombre, categoria, tier_mvp, temporada) "
            "VALUES (%s, %s, %s, %s, 2025)",
            (req.sponsor_id, req.nombre, req.categoria, req.tier_mvp),
        )
        conn.commit()
        cursor.close()
    finally:
        conn.close()

    return {"message": f"Sponsor '{req.sponsor_id}' creado", "sponsor_id": req.sponsor_id}


@router.get("/{sponsor_id}")
def get_sponsor(sponsor_id: str):
    """Detalle de un sponsor."""
    return fetch_one("SELECT * FROM sponsors WHERE sponsor_id = %s", (sponsor_id,))


@router.get("/{sponsor_id}/smv")
def get_sponsor_smv(sponsor_id: str, match_id: str = None):
    """SMV desglosado de un sponsor por entidad, posicion y contexto."""
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

    query += (
        "GROUP BY d.entity_id, d.position_type, d.context_type, d.localidad, d.match_id "
        "ORDER BY smv DESC"
    )
    rows = fetch_all(query, tuple(params))
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


@router.get("/{sponsor_id}/menciones")
def get_sponsor_menciones(sponsor_id: str, match_id: str = None):
    """Menciones de audio de un sponsor."""
    query = "SELECT * FROM menciones_audio WHERE sponsor_id = %s "
    params = [sponsor_id]
    if match_id:
        query += "AND match_id = %s "
        params.append(match_id)
    query += "ORDER BY match_id, timestamp_seg"
    return fetch_all(query, tuple(params))


@router.get("/{sponsor_id}/summary")
def get_sponsor_summary(sponsor_id: str):
    """Resumen de un sponsor: SMV total, detecciones, partidos, segundos."""
    row = fetch_one(
        "SELECT COUNT(*) as detecciones, "
        "COALESCE(SUM(smv_parcial), 0) as smv_total, "
        "COUNT(DISTINCT match_id) as partidos "
        "FROM detecciones WHERE aprobada = 1 AND sponsor_id = %s",
        (sponsor_id,),
    )
    if row:
        row["smv_total"] = float(row["smv_total"] or 0)
        row["segundos"] = row["detecciones"]  # 1 det = 1 seg a 1fps
    return row


@router.get("/{sponsor_id}/by-match")
def get_sponsor_by_match(sponsor_id: str):
    """SMV del sponsor desglosado por partido."""
    rows = fetch_all(
        "SELECT match_id, SUM(smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones WHERE aprobada = 1 AND sponsor_id = %s "
        "GROUP BY match_id ORDER BY smv DESC",
        (sponsor_id,),
    )
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows


@router.get("/{sponsor_id}/by-position")
def get_sponsor_by_position(sponsor_id: str):
    """SMV del sponsor desglosado por posicion."""
    rows = fetch_all(
        "SELECT position_type, SUM(smv_parcial) as smv, COUNT(*) as detecciones "
        "FROM detecciones WHERE aprobada = 1 AND sponsor_id = %s "
        "GROUP BY position_type ORDER BY smv DESC",
        (sponsor_id,),
    )
    for r in rows:
        r["smv"] = float(r["smv"] or 0)
    return rows
