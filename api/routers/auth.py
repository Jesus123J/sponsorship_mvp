"""Rutas de autenticacion y sesiones."""
from fastapi import APIRouter, HTTPException, Depends, Request
from api.schemas import LoginRequest, RegisterRequest
from api.core.security import get_current_user, require_admin
from api.controllers import auth_controller as ctrl
from api.controllers import sessions_controller as sessions

router = APIRouter()


@router.post("/login")
def login(req: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    result = ctrl.login(req.email, req.password, ip, user_agent)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.post("/logout")
def logout(request: Request, current_user: dict = Depends(get_current_user)):
    token = request.headers.get("authorization", "").replace("Bearer ", "")
    ctrl.logout(token)
    return {"message": "Sesion cerrada"}


@router.post("/logout-all")
def logout_all(current_user: dict = Depends(get_current_user)):
    sessions.close_all_sessions(current_user["id"])
    return {"message": "Todas las sesiones cerradas"}


@router.post("/register")
def register(req: RegisterRequest):
    result = ctrl.register(req.email, req.password, req.nombre, req.sponsor_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/me")
def get_profile(current_user: dict = Depends(get_current_user)):
    user = ctrl.get_profile(current_user["id"])
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


@router.get("/sessions")
def my_sessions(current_user: dict = Depends(get_current_user)):
    """Mis sesiones activas."""
    return sessions.get_active_sessions(current_user["id"])


# ── Solo admin ──

@router.get("/sessions/all")
def all_sessions(current_user: dict = Depends(require_admin)):
    """Todas las sesiones activas (admin)."""
    return sessions.get_all_active_sessions()


@router.delete("/sessions/{session_id}")
def close_session(session_id: int, current_user: dict = Depends(require_admin)):
    """Cerrar una sesion por ID (admin)."""
    sessions.close_session_by_id(session_id)
    return {"message": f"Sesion {session_id} cerrada"}
