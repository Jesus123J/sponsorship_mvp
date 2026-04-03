"""K-Means: extrae color dominante del logo y lo compara con colores de cada equipo."""
import cv2, numpy as np
from sklearn.cluster import KMeans

def clasificar_equipo(frame, bbox, config, entidades):
    x, y, w, h = bbox['x'], bbox['y'], bbox['w'], bbox['h']
    region = frame[y:y+h, x:x+w]
    if region.size == 0: return None
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([35, 40, 40]), np.array([85, 255, 255]))
    pixels = hsv[mask == 0]
    if len(pixels) < 10: return None
    km = KMeans(n_clusters=1, n_init=3, random_state=42)
    km.fit(pixels)
    detected = km.cluster_centers_[0]
    local_id = config['equipo_local']
    visit_id = config['equipo_visitante']
    overrides = config.get('color_override', {})
    c_local = np.array(overrides.get(local_id, entidades[local_id]['color_primario_hsv']))
    c_visit = np.array(overrides.get(visit_id, entidades[visit_id]['color_primario_hsv']))
    d_local = np.linalg.norm(detected - c_local)
    d_visit = np.linalg.norm(detected - c_visit)
    d_min = min(d_local, d_visit)
    equipo = local_id if d_local < d_visit else visit_id
    conf = 'alta' if d_min < 15 else 'media' if d_min < 30 else 'baja'
    return {
        'entity_id': equipo,
        'color_detectado_hsv': detected.tolist(),
        'color_distancia': round(float(d_min), 2),
        'attribution_confidence': conf
    }
