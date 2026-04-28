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


def _filter_pixels_kmeans(hsv_pixels, k: int = 3):
    """Encuentra los K colores dominantes via K-Means.

    Retorna lista [(hsv_center, weight)...] ordenada por peso (mayor a menor).
    """
    if not HAS_CV or len(hsv_pixels) < k:
        return []

    pixels_f32 = hsv_pixels.astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(pixels_f32, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    labels = labels.flatten()
    counts = np.bincount(labels, minlength=k)
    total = counts.sum()
    result = []
    for i in range(k):
        result.append((tuple(int(v) for v in centers[i]), counts[i] / total if total > 0 else 0))
    result.sort(key=lambda x: -x[1])
    return result


def dominant_colors_around_logo(frame, logo_bbox):
    """Sample area of jersey around logo, filter skin/grass/extremes,
    and run K-Means para encontrar 3 colores dominantes con su peso.

    Retorna lista [(hsv, weight), ...] ordenada por dominancia.
    """
    if not HAS_CV:
        return []

    x1, y1, x2, y2 = [int(v) for v in logo_bbox]
    h, w = frame.shape[:2]
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return []

    # Sampling: rectangulo expandido alrededor del logo
    pad_x = int(bw * 0.4)
    pad_y = int(bh * 0.6)
    sx1 = max(0, x1 - pad_x)
    sx2 = min(w, x2 + pad_x)
    sy1 = max(0, y1 - pad_y)
    sy2 = min(h, y2 + pad_y)

    region = frame[sy1:sy2, sx1:sx2]
    if region.size == 0:
        return []

    # Enmascarar el logo mismo (no queremos sus colores)
    mask = np.ones(region.shape[:2], dtype=bool)
    iy1 = max(0, y1 - sy1)
    iy2 = min(region.shape[0], y2 - sy1)
    ix1 = max(0, x1 - sx1)
    ix2 = min(region.shape[1], x2 - sx1)
    mask[iy1:iy2, ix1:ix2] = False

    pixels_bgr = region[mask].reshape(-1, 3)
    if len(pixels_bgr) < 100:
        return []

    hsv = cv2.cvtColor(pixels_bgr.reshape(1, -1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    h_arr, s_arr, v_arr = hsv[:, 0], hsv[:, 1], hsv[:, 2]

    # Filtros — excluir lo que NO es camiseta:
    # 1. Piel (tonos cara/manos): H 0-25, S 30-150, V 80-220
    is_skin = (h_arr <= 25) & (s_arr >= 30) & (s_arr <= 160) & (v_arr >= 80) & (v_arr <= 220)
    # 2. Cesped: H 30-90, S>=50 (verde de cancha)
    is_grass = (h_arr >= 30) & (h_arr <= 90) & (s_arr >= 50)
    # 3. Negro/sombras (V muy bajo)
    is_black = v_arr < 35
    # 4. Blanco extremo (V casi 255 + saturacion casi 0)
    is_extreme_white = (v_arr >= 240) & (s_arr <= 15)

    valid_mask = ~(is_skin | is_grass | is_black | is_extreme_white)
    valid_pixels = hsv[valid_mask]

    if len(valid_pixels) < 50:
        # Fallback: usar todo si filtramos demasiado
        valid_pixels = hsv

    return _filter_pixels_kmeans(valid_pixels, k=3)


def classify_team_by_color(frame, logo_bbox, team_colors: dict, team_secondary_colors: dict | None = None) -> tuple[str | None, float]:
    """Atribuye al equipo mas cercano usando los 2-3 colores dominantes vs primario+secundario.

    team_colors = { 'alianza_lima': (H,S,V), ... }                  primarios
    team_secondary_colors = { 'alianza_lima': (H,S,V), ... }        secundarios (opcional)
    """
    dominants = dominant_colors_around_logo(frame, logo_bbox)
    if not dominants or not team_colors:
        return (None, float('inf'))

    team_secondary_colors = team_secondary_colors or {}

    # Para cada equipo: distancia minima entre cualquiera de sus colores
    # (primario o secundario) y cualquiera de los 2 colores dominantes top.
    # Pesa la distancia por la dominancia del color sampleado.
    best_id, best_score = None, float('inf')
    top_dominants = dominants[:2]  # solo los 2 mas dominantes

    for eid, primary in team_colors.items():
        if primary is None:
            continue
        secondary = team_secondary_colors.get(eid)
        team_palette = [primary] + ([secondary] if secondary else [])

        # Score del equipo = mejor (menor) match entre sus colores y los dominantes
        team_min_dist = float('inf')
        for tc in team_palette:
            for dom_hsv, weight in top_dominants:
                d = hsv_distance(dom_hsv, tc)
                # Penalizar menos los matches del color mas dominante
                weighted = d * (1.5 - weight)  # weight 0-1, factor 0.5-1.5
                if weighted < team_min_dist:
                    team_min_dist = weighted

        if team_min_dist < best_score:
            best_score = team_min_dist
            best_id = eid

    return (best_id, best_score)


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


