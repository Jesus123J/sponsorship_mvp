"""JWT authentication — genera y valida tokens."""
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from api.core.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

security_scheme = HTTPBearer()


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Crea un JWT con los datos del usuario."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=JWT_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> dict:
    """Dependency de FastAPI — extrae y valida el usuario del token JWT."""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalido")
        return {
            "id": int(user_id),
            "email": payload.get("email"),
            "rol": payload.get("rol"),
            "sponsor_id": payload.get("sponsor_id"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expirado o invalido")


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency que requiere rol admin."""
    if current_user["rol"] != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol admin")
    return current_user
