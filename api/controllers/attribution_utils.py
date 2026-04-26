"""Utilidades para atribucion por equipo (K-Means de color) y deteccion de overlays (artificial vs fisico).

La atribucion por equipo usa los colores HSV guardados en la tabla `entidades`.
La deteccion de overlay usa 3 señales: estabilidad de posicion, saturacion y nitidez de bordes.
"""
from __future__ import annotations
import json
import math
from collections import defaultdict

try:
    import cv2
    import numpy as np
    HAS_CV = True
except ImportError:
    HAS_CV = False


# ──────────────────────────────────────────────────────────────
# Atribucion por equipo (K-Means de color HSV)
# ──────────────────────────────────────────────────────────────

def parse_hsv_from_db(value) -> tuple[int, int, int] | None:
    """Los colores en entidades estan en formato '[H,S,V]' con H:0-360, S/V: 0-100.

    OpenCV usa H:0-180, S/V:0-255, asi que convertimos aqui.
    """
    if value is None:
        return None
    try:
        if isinstance(value, str):
            arr = json.loads(value)
        else:
            arr = value
        h, s, v = int(arr[0]), int(arr[1]), int(arr[2])
        return (h // 2, int(s * 2.55), int(v * 2.55))
    except Exception:
        return None


def hsv_distance(hsv1: tuple[int, int, int], hsv2: tuple[int, int, int]) -> float:
    """Distancia circular en HSV. H es angular (wrap-around)."""
    dh = min(abs(hsv1[0] - hsv2[0]), 180 - abs(hsv1[0] - hsv2[0])) * 2
    ds = abs(hsv1[1] - hsv2[1])
    dv = abs(hsv1[2] - hsv2[2])
    # H pesa mas (el color importa mas que luminosidad en un estadio)
    return math.sqrt((dh * 1.5) ** 2 + ds ** 2 + (dv * 0.3) ** 2)


def dominant_color_around_logo(frame, logo_bbox, expand_factor=1.2):
    """Toma la franja de camiseta alrededor del bbox del logo (arriba y abajo, evitando el logo mismo)
    y devuelve el color HSV dominante por histograma de hue."""
    if not HAS_CV:
        return None
    x1, y1, x2, y2 = [int(v) for v in logo_bbox]
    h, w = frame.shape[:2]
    bw, bh = x2 - x1, y2 - y1

    # franja arriba y abajo del logo, del mismo ancho
    top_y1 = max(0, int(y1 - bh * expand_factor))
    top_y2 = y1
    bot_y1 = y2
    bot_y2 = min(h, int(y2 + bh * expand_factor))
    sx1 = max(0, int(x1 - bw * 0.1))
    sx2 = min(w, int(x2 + bw * 0.1))

    strips = []
    if top_y2 > top_y1:
        strips.append(frame[top_y1:top_y2, sx1:sx2])
    if bot_y2 > bot_y1:
        strips.append(frame[bot_y1:bot_y2, sx1:sx2])
    if not strips:
        return None

    combined = np.concatenate([s.reshape(-1, 3) for s in strips], axis=0)
    if combined.size == 0:
        return None

    hsv = cv2.cvtColor(combined.reshape(1, -1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    # Filtrar pixeles muy oscuros (sombras) y muy claros (luces/cesped blanco)
    valid = hsv[(hsv[:, 2] > 40) & (hsv[:, 2] < 240) & (hsv[:, 1] > 30)]
    if len(valid) < 20:
        valid = hsv  # fallback

    # Color dominante por moda del hue (mas robusto que media)
    h_mode = int(np.median(valid[:, 0]))
    s_mode = int(np.median(valid[:, 1]))
    v_mode = int(np.median(valid[:, 2]))
    return (h_mode, s_mode, v_mode)


def classify_team_by_color(frame, logo_bbox, team_colors: dict) -> tuple[str | None, float]:
    """Devuelve (entity_id, distancia) del equipo mas cercano por color.

    team_colors = { 'alianza_lima': (H,S,V), 'universitario': (H,S,V), ... }
    """
    dominant = dominant_color_around_logo(frame, logo_bbox)
    if dominant is None or not team_colors:
        return (None, float('inf'))

    best_id, best_dist = None, float('inf')
    for eid, tc in team_colors.items():
        if tc is None:
            continue
        d = hsv_distance(dominant, tc)
        if d < best_dist:
            best_dist = d
            best_id = eid
    return (best_id, best_dist)


# ──────────────────────────────────────────────────────────────
# Deteccion jugador real vs hincha/staff (pitch verde)
# ──────────────────────────────────────────────────────────────

def is_on_pitch(frame, person_bbox, min_green_ratio: float = 0.20) -> tuple[bool, float]:
    """Detecta si una persona esta parada sobre el césped (jugador real) o no (tribuna/staff).

    Analiza la zona de los pies (30% inferior del bbox + extension abajo) y mide
    que porcentaje es verde en HSV.

    Returns: (is_on_pitch, green_ratio)
    """
    if not HAS_CV or frame is None:
        return (True, 0.0)  # fallback: asumir jugador si no hay cv2

    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in person_bbox]
    bh = y2 - y1
    bw = x2 - x1

    if bh <= 0 or bw <= 0:
        return (False, 0.0)

    # Zona de pies: parte inferior 30% del bbox + 10% mas abajo y a los costados
    foot_y1 = int(y1 + bh * 0.70)
    foot_y2 = min(h, int(y2 + bh * 0.10))
    foot_x1 = max(0, int(x1 - bw * 0.10))
    foot_x2 = min(w, int(x2 + bw * 0.10))

    if foot_y2 <= foot_y1 or foot_x2 <= foot_x1:
        return (False, 0.0)

    zone = frame[foot_y1:foot_y2, foot_x1:foot_x2]
    if zone.size == 0:
        return (False, 0.0)

    hsv = cv2.cvtColor(zone, cv2.COLOR_BGR2HSV)
    # Rango de verde (césped) amplio para distintas iluminaciones
    # H: 25-90 (verde amarillento a verde azulado)
    # S: 30+ (evitar grises/blanquecinos)
    # V: 30-240 (evitar muy oscuro y muy brillante)
    green_mask = cv2.inRange(hsv, (25, 30, 30), (90, 255, 240))

    total = hsv.shape[0] * hsv.shape[1]
    green = cv2.countNonZero(green_mask)
    ratio = green / total if total > 0 else 0.0

    return (ratio >= min_green_ratio, round(ratio, 3))


# ──────────────────────────────────────────────────────────────
# Deteccion overlay digital vs fisico
# ──────────────────────────────────────────────────────────────

class OverlayDetector:
    """Track posicion de cada sponsor entre frames. Si un sponsor aparece en la
    MISMA posicion por N frames seguidos → probable overlay digital.

    Combinado con saturacion y nitidez de bordes para mayor precision.
    """

    def __init__(self, position_tolerance_px=15, min_stable_frames=3):
        self.position_tolerance = position_tolerance_px
        self.min_stable_frames = min_stable_frames
        # { sponsor: [(frame_idx, bbox), ...] }
        self.history: dict = defaultdict(list)
        self.max_history = 30

    def _bbox_center(self, bbox):
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    def _same_position(self, bbox_a, bbox_b):
        ca = self._bbox_center(bbox_a)
        cb = self._bbox_center(bbox_b)
        return math.hypot(ca[0] - cb[0], ca[1] - cb[1]) < self.position_tolerance

    def _size_similar(self, bbox_a, bbox_b, tol=0.1):
        wa, ha = bbox_a[2] - bbox_a[0], bbox_a[3] - bbox_a[1]
        wb, hb = bbox_b[2] - bbox_b[0], bbox_b[3] - bbox_b[1]
        if wa == 0 or ha == 0:
            return False
        return abs(wa - wb) / wa < tol and abs(ha - hb) / ha < tol

    def classify(self, frame, sponsor: str, frame_idx: int, bbox, on_player: bool):
        """Clasifica la deteccion. Retorna dict con surface_type, is_overlay, signals."""
        # Si esta sobre jugador NO puede ser overlay (los jugadores se mueven)
        if on_player:
            self._add_to_history(sponsor, frame_idx, bbox)
            return {
                "surface_type": "fisico_camiseta",
                "is_overlay": False,
                "stable_frames": 0,
                "signals": {"on_player": True},
            }

        # Señal 1: estabilidad de posicion entre frames
        recent = self.history[sponsor][-self.max_history:]
        stable_count = 0
        for _, prev_bbox in reversed(recent):
            if self._same_position(bbox, prev_bbox) and self._size_similar(bbox, prev_bbox):
                stable_count += 1
            else:
                break

        # Señal 2: saturacion alta (overlays tienen colores puros)
        saturation = None
        sharpness = None
        if HAS_CV:
            x1, y1, x2, y2 = [max(0, int(v)) for v in bbox]
            if x2 > x1 and y2 > y1:
                patch = frame[y1:y2, x1:x2]
                if patch.size > 0:
                    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
                    saturation = float(hsv[:, :, 1].mean())
                    # Señal 3: nitidez (overlays tienen bordes perfectos)
                    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
                    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Decision: combinacion ponderada
        is_overlay = False
        score = 0
        if stable_count >= self.min_stable_frames:
            score += 3  # la señal mas fuerte
        if saturation is not None and saturation > 170:
            score += 1
        if sharpness is not None and sharpness > 600:
            score += 1

        is_overlay = score >= 3  # necesita estabilidad + al menos algo mas

        surface_type = "overlay_digital" if is_overlay else "fisico_estadio"

        self._add_to_history(sponsor, frame_idx, bbox)

        return {
            "surface_type": surface_type,
            "is_overlay": is_overlay,
            "stable_frames": stable_count,
            "signals": {
                "stable_frames": stable_count,
                "saturation": round(saturation, 1) if saturation is not None else None,
                "sharpness": round(sharpness, 1) if sharpness is not None else None,
                "score": score,
            },
        }

    def _add_to_history(self, sponsor: str, frame_idx: int, bbox):
        self.history[sponsor].append((frame_idx, bbox))
        if len(self.history[sponsor]) > self.max_history:
            self.history[sponsor].pop(0)
