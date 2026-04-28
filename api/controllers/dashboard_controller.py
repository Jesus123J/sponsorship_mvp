"""Logica de negocio — estadisticas del dashboard."""
from api.database import fetch_all, fetch_one, get_connection


def get_stats() -> dict:
    """Estadisticas REALES (excluye partidos es_prueba=1).

    'partidos_analizados' cuenta solo partidos REALES que tienen al menos 1 deteccion.
    """
    partidos = fetch_one(
        "SELECT COUNT(DISTINCT p.match_id) as total "
        "FROM partidos p "
        "JOIN detecciones d ON d.match_id = p.match_id "
        "WHERE p.es_prueba = 0 AND d.aprobada = 1"
    )
    sponsors = fetch_one("SELECT COUNT(*) as total FROM sponsors")
    detecciones = fetch_one(
        "SELECT COUNT(*) as total, COALESCE(SUM(d.smv_parcial), 0) as smv_total "
        "FROM detecciones d "
        "JOIN partidos p ON d.match_id = p.match_id "
        "WHERE d.aprobada = 1 AND p.es_prueba = 0"
    )
    # Partidos en prueba (separado)
    prueba = fetch_one(
        "SELECT COUNT(DISTINCT p.match_id) as partidos, "
        "       COUNT(d.id) as detecciones, "
        "       COALESCE(SUM(d.smv_parcial), 0) as smv_total "
        "FROM partidos p "
        "LEFT JOIN detecciones d ON d.match_id = p.match_id AND d.aprobada = 1 "
        "WHERE p.es_prueba = 1"
    )

    return {
        "partidos": partidos["total"] if partidos else 0,
        "sponsors": sponsors["total"] if sponsors else 0,
        "detecciones": detecciones["total"] if detecciones else 0,
        "smv_total": float(detecciones["smv_total"]) if detecciones else 0,
        "prueba": {
            "partidos": prueba["partidos"] if prueba else 0,
            "detecciones": prueba["detecciones"] if prueba else 0,
            "smv_total": float(prueba["smv_total"]) if prueba else 0,
        },
    }


def get_top_sponsors(limit: int = 5) -> list:
    """Top sponsors por SMV total — solo datos REALES."""
    rows = fetch_all(
        "SELECT d.sponsor_id, s.nombre, SUM(d.smv_parcial) as smv_total, COUNT(*) as detecciones "
        "FROM detecciones d "
        "JOIN sponsors s ON d.sponsor_id = s.sponsor_id "
        "JOIN partidos p ON d.match_id = p.match_id "
        "WHERE d.aprobada = 1 AND p.es_prueba = 0 "
        "GROUP BY d.sponsor_id, s.nombre "
        "ORDER BY smv_total DESC LIMIT %s",
        (limit,),
    )
    for r in rows:
        r["smv_total"] = float(r["smv_total"] or 0)
    return rows


def list_prueba_partidos() -> list:
    """Lista partidos en modo prueba con resumen de detecciones."""
    return fetch_all(
        "SELECT p.match_id, p.equipo_local, p.equipo_visitante, p.fecha, p.created_at, "
        "       COUNT(d.id) as total_detecciones, "
        "       COALESCE(SUM(d.smv_parcial), 0) as smv_total "
        "FROM partidos p "
        "LEFT JOIN detecciones d ON d.match_id = p.match_id AND d.aprobada = 1 "
        "WHERE p.es_prueba = 1 "
        "GROUP BY p.match_id, p.equipo_local, p.equipo_visitante, p.fecha, p.created_at "
        "ORDER BY p.created_at DESC"
    )


def promote_partido_to_real(match_id: str) -> dict:
    """Marca un partido de prueba como real (es_prueba=0) — desde aqui cuenta en el dashboard."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE partidos SET es_prueba = 0 WHERE match_id = %s", (match_id,))
    rows = cursor.rowcount
    conn.commit()
    cursor.close(); conn.close()
    if rows == 0:
        return {"error": f"Partido '{match_id}' no existe", "status": 404}
    return {"message": f"Partido '{match_id}' promovido a real", "match_id": match_id}


def delete_partido(match_id: str) -> dict:
    """Elimina un partido y todas sus detecciones."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detecciones WHERE match_id = %s", (match_id,))
    det_deleted = cursor.rowcount
    cursor.execute("DELETE FROM partidos WHERE match_id = %s", (match_id,))
    part_deleted = cursor.rowcount
    conn.commit()
    cursor.close(); conn.close()
    if part_deleted == 0:
        return {"error": f"Partido '{match_id}' no existe", "status": 404}
    return {
        "message": f"Partido '{match_id}' eliminado",
        "detecciones_eliminadas": det_deleted,
    }


def delete_all_prueba() -> dict:
    """Elimina TODOS los partidos de prueba y sus detecciones."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM detecciones WHERE match_id IN (SELECT match_id FROM partidos WHERE es_prueba = 1)"
    )
    det = cursor.rowcount
    cursor.execute("DELETE FROM partidos WHERE es_prueba = 1")
    part = cursor.rowcount
    conn.commit()
    cursor.close(); conn.close()
    return {
        "message": "Datos de prueba eliminados",
        "partidos_eliminados": part,
        "detecciones_eliminadas": det,
    }
