"""Logica de negocio — planes y suscripciones."""
from api.database import fetch_all, fetch_one, get_connection


def list_plans() -> list:
    """Lista planes activos."""
    return fetch_all("SELECT * FROM planes WHERE activo = 1 ORDER BY precio_mensual")


def get_plan(plan_id: int) -> dict | None:
    """Detalle de un plan."""
    return fetch_one("SELECT * FROM planes WHERE id = %s", (plan_id,))


def subscribe(usuario_id: int, plan_id: int, ciclo: str) -> dict:
    """Suscribe un usuario a un plan. Cancela suscripcion anterior."""
    plan = fetch_one("SELECT * FROM planes WHERE id = %s AND activo = 1", (plan_id,))
    if not plan:
        return {"error": "Plan no encontrado", "status": 404}

    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Cancelar suscripcion anterior
        cursor.execute(
            "UPDATE suscripciones SET estado = 'cancelada' "
            "WHERE usuario_id = %s AND estado = 'activa'",
            (usuario_id,),
        )

        interval = "1 YEAR" if ciclo == "anual" else "1 MONTH"
        cursor.execute(
            "INSERT INTO suscripciones (usuario_id, plan_id, estado, fecha_inicio, fecha_fin, ciclo) "
            f"VALUES (%s, %s, 'activa', CURDATE(), DATE_ADD(CURDATE(), INTERVAL {interval}), %s)",
            (usuario_id, plan_id, ciclo),
        )

        conn.commit()
        sub_id = cursor.lastrowid
        cursor.close()
    finally:
        conn.close()

    return {"subscription_id": sub_id, "plan": plan["nombre"], "ciclo": ciclo, "estado": "activa"}


def get_my_subscription(usuario_id: int) -> dict:
    """Suscripcion activa del usuario."""
    sub = fetch_one(
        "SELECT s.*, p.nombre as plan_nombre, p.precio_mensual, p.precio_anual, "
        "p.max_marcas, p.max_partidos_mes, p.incluye_audio, p.incluye_social, "
        "p.incluye_api, p.incluye_pdf "
        "FROM suscripciones s JOIN planes p ON s.plan_id = p.id "
        "WHERE s.usuario_id = %s AND s.estado = 'activa' "
        "ORDER BY s.fecha_inicio DESC LIMIT 1",
        (usuario_id,),
    )
    if not sub:
        return {"message": "Sin suscripcion activa"}
    return sub
