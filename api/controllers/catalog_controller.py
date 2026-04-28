"""CRUD del catalogo: clubes (entidades), estadios y torneos."""
from api.database import fetch_all, fetch_one, get_connection


# ══════════════════════════════════════════════
# EQUIPOS (entidades type=club)
# ══════════════════════════════════════════════

def list_equipos() -> list:
    rows = fetch_all(
        """SELECT e.*, est.nombre AS estadio_nombre
           FROM entidades e
           LEFT JOIN estadios est ON e.estadio_id = est.estadio_id
           WHERE e.entity_type = 'club'
           ORDER BY e.nombre_corto"""
    )
    return rows


def create_equipo(data: dict) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO entidades
               (entity_id, nombre, nombre_corto, entity_type, color_primario_hsv,
                color_secundario_hsv, estadio, estadio_id, activo)
               VALUES (%s,%s,%s,'club',%s,%s,%s,%s,1)""",
            (
                data["entity_id"], data["nombre"], data.get("nombre_corto"),
                data.get("color_primario_hsv"), data.get("color_secundario_hsv"),
                data.get("estadio_nombre"), data.get("estadio_id"),
            ),
        )
        conn.commit()
        return {"message": "Equipo creado", "entity_id": data["entity_id"]}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def update_equipo(entity_id: str, data: dict) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        fields = []
        values = []
        for f in ("nombre", "nombre_corto", "color_primario_hsv",
                  "color_secundario_hsv", "estadio_id", "activo"):
            if f in data:
                fields.append(f"{f} = %s")
                values.append(data[f])
        if not fields:
            return {"error": "Nada que actualizar", "status": 400}
        values.append(entity_id)
        cursor.execute(
            f"UPDATE entidades SET {', '.join(fields)} WHERE entity_id = %s AND entity_type = 'club'",
            values,
        )
        conn.commit()
        if cursor.rowcount == 0:
            return {"error": "Equipo no encontrado", "status": 404}
        return {"message": "Equipo actualizado"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def delete_equipo(entity_id: str) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM entidades WHERE entity_id = %s AND entity_type = 'club'", (entity_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return {"error": "Equipo no encontrado", "status": 404}
        return {"message": "Equipo eliminado"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


# ══════════════════════════════════════════════
# ESTADIOS
# ══════════════════════════════════════════════

def list_estadios() -> list:
    return fetch_all(
        """SELECT e.*, ent.nombre AS propietario_nombre
           FROM estadios e
           LEFT JOIN entidades ent ON e.club_propietario_id = ent.entity_id
           WHERE e.activo = 1
           ORDER BY e.nombre"""
    )


def create_estadio(data: dict) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO estadios (estadio_id, nombre, ciudad, pais, capacidad, club_propietario_id)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (
                data["estadio_id"], data["nombre"],
                data.get("ciudad"), data.get("pais", "Peru"),
                data.get("capacidad"), data.get("club_propietario_id"),
            ),
        )
        conn.commit()
        return {"message": "Estadio creado", "estadio_id": data["estadio_id"]}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def update_estadio(estadio_id: str, data: dict) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        fields = []
        values = []
        for f in ("nombre", "ciudad", "pais", "capacidad", "club_propietario_id", "activo"):
            if f in data:
                fields.append(f"{f} = %s")
                values.append(data[f])
        if not fields:
            return {"error": "Nada que actualizar", "status": 400}
        values.append(estadio_id)
        cursor.execute(
            f"UPDATE estadios SET {', '.join(fields)} WHERE estadio_id = %s", values,
        )
        conn.commit()
        if cursor.rowcount == 0:
            return {"error": "Estadio no encontrado", "status": 404}
        return {"message": "Estadio actualizado"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def delete_estadio(estadio_id: str) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute("UPDATE estadios SET activo = 0 WHERE estadio_id = %s", (estadio_id,))
        conn.commit()
        return {"message": "Estadio desactivado"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


# ══════════════════════════════════════════════
# TORNEOS
# ══════════════════════════════════════════════

def list_torneos() -> list:
    return fetch_all("SELECT * FROM torneos WHERE activo = 1 ORDER BY temporada DESC, nombre")


def create_torneo(data: dict) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO torneos (torneo_id, nombre, tipo, pais, confederacion, temporada)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (
                data["torneo_id"], data["nombre"],
                data.get("tipo"), data.get("pais"),
                data.get("confederacion"), data.get("temporada"),
            ),
        )
        conn.commit()
        return {"message": "Torneo creado", "torneo_id": data["torneo_id"]}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def update_torneo(torneo_id: str, data: dict) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        fields = []
        values = []
        for f in ("nombre", "tipo", "pais", "confederacion", "temporada", "activo"):
            if f in data:
                fields.append(f"{f} = %s")
                values.append(data[f])
        if not fields:
            return {"error": "Nada que actualizar", "status": 400}
        values.append(torneo_id)
        cursor.execute(
            f"UPDATE torneos SET {', '.join(fields)} WHERE torneo_id = %s", values,
        )
        conn.commit()
        if cursor.rowcount == 0:
            return {"error": "Torneo no encontrado", "status": 404}
        return {"message": "Torneo actualizado"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def delete_torneo(torneo_id: str) -> dict:
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute("UPDATE torneos SET activo = 0 WHERE torneo_id = %s", (torneo_id,))
        conn.commit()
        return {"message": "Torneo desactivado"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


# ══════════════════════════════════════════════
# PARTIDOS (extension del CRUD existente)
# ══════════════════════════════════════════════

def upsert_partido(data: dict) -> dict:
    """Crea o actualiza un partido con sus FKs (torneo_id, estadio_id)."""
    match_id = data.get("match_id")
    if not match_id:
        return {"error": "match_id requerido", "status": 400}

    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute("SELECT match_id FROM partidos WHERE match_id = %s", (match_id,))
        exists = cursor.fetchone()

        if exists:
            fields = []
            values = []
            for f in ("equipo_local", "equipo_visitante", "torneo_id", "estadio_id",
                      "fecha", "canal", "audiencia_estimada", "match_type",
                      "torneo", "jornada", "resultado", "es_prueba"):
                if f in data:
                    fields.append(f"{f} = %s")
                    values.append(data[f])
            if fields:
                values.append(match_id)
                cursor.execute(
                    f"UPDATE partidos SET {', '.join(fields)} WHERE match_id = %s", values,
                )
            conn.commit()
            return {"message": "Partido actualizado", "match_id": match_id}
        else:
            cursor.execute(
                """INSERT INTO partidos
                   (match_id, equipo_local, equipo_visitante, torneo, torneo_id,
                    jornada, match_type, fecha, canal, resultado, audiencia_estimada,
                    estadio_id, model_version, es_prueba)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    match_id, data.get("equipo_local"), data.get("equipo_visitante"),
                    data.get("torneo"), data.get("torneo_id"),
                    data.get("jornada"), data.get("match_type", "regular"),
                    data.get("fecha"), data.get("canal", "l1max"), data.get("resultado"),
                    data.get("audiencia_estimada", 850000), data.get("estadio_id"),
                    data.get("model_version", "yolo_v1.0"), data.get("es_prueba", 0),
                ),
            )
            conn.commit()
            return {"message": "Partido creado", "match_id": match_id}
    except Exception as e:
        conn.rollback()
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def list_partidos_full() -> list:
    """Lista partidos con nombres de equipos, torneo y estadio resueltos."""
    return fetch_all(
        """SELECT p.*,
                  el.nombre AS local_nombre, ev.nombre AS visitante_nombre,
                  t.nombre AS torneo_nombre,
                  e.nombre AS estadio_nombre
           FROM partidos p
           LEFT JOIN entidades el ON p.equipo_local = el.entity_id
           LEFT JOIN entidades ev ON p.equipo_visitante = ev.entity_id
           LEFT JOIN torneos t ON p.torneo_id = t.torneo_id
           LEFT JOIN estadios e ON p.estadio_id = e.estadio_id
           ORDER BY p.created_at DESC"""
    )
