"""Endpoints de planes y suscripciones."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.database import fetch_all, fetch_one, get_connection

router = APIRouter()


@router.get("/")
def list_plans():
    """Lista todos los planes activos."""
    return fetch_all("SELECT * FROM planes WHERE activo = 1 ORDER BY precio_mensual")


@router.get("/{plan_id}")
def get_plan(plan_id: int):
    """Detalle de un plan."""
    plan = fetch_one("SELECT * FROM planes WHERE id = %s", (plan_id,))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return plan


class SubscribeRequest(BaseModel):
    usuario_id: int
    plan_id: int
    ciclo: str = "mensual"  # mensual o anual


@router.post("/subscribe")
def subscribe(req: SubscribeRequest):
    """Suscribe un usuario a un plan."""
    plan = fetch_one("SELECT * FROM planes WHERE id = %s AND activo = 1", (req.plan_id,))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    user = fetch_one("SELECT id FROM usuarios WHERE id = %s", (req.usuario_id,))
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Cancelar suscripcion anterior si existe
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE suscripciones SET estado = 'cancelada' "
            "WHERE usuario_id = %s AND estado = 'activa'",
            (req.usuario_id,),
        )

        # Crear nueva suscripcion
        if req.ciclo == "anual":
            cursor.execute(
                "INSERT INTO suscripciones (usuario_id, plan_id, estado, fecha_inicio, fecha_fin, ciclo) "
                "VALUES (%s, %s, 'activa', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 'anual')",
                (req.usuario_id, req.plan_id),
            )
        else:
            cursor.execute(
                "INSERT INTO suscripciones (usuario_id, plan_id, estado, fecha_inicio, fecha_fin, ciclo) "
                "VALUES (%s, %s, 'activa', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'mensual')",
                (req.usuario_id, req.plan_id),
            )

        conn.commit()
        sub_id = cursor.lastrowid
        cursor.close()
    finally:
        conn.close()

    return {"subscription_id": sub_id, "plan": plan["nombre"], "ciclo": req.ciclo, "estado": "activa"}


@router.get("/user/{usuario_id}")
def get_user_subscription(usuario_id: int):
    """Suscripcion activa de un usuario."""
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
