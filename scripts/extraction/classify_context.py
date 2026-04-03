"""Clasifica match_period y context_type por timestamp."""
import json

def clasificar_periodo(timestamp_seg, config):
    pitido = config.get('timestamp_pitido_inicial', 0)
    t1_fin = config['duracion_primera_mitad_seg']
    et_fin = t1_fin + config['duracion_entretiempo_seg']
    if timestamp_seg < pitido: return 'pre_partido'
    elif timestamp_seg <= t1_fin: return 'primera_mitad'
    elif timestamp_seg <= et_fin: return 'entretiempo'
    else: return 'segunda_mitad'

def clasificar_contexto(timestamp_seg, config):
    period = clasificar_periodo(timestamp_seg, config)
    comerciales = config.get('timestamps_comerciales', [])
    goles = config.get('minutos_gol', [])
    for inicio, fin in comerciales:
        if inicio <= timestamp_seg <= fin:
            return period, 'comercial_liga'
    if period == 'entretiempo':
        for gol_min in goles:
            if abs(timestamp_seg - gol_min * 60) < 60:
                return period, 'replay_entretiempo_gol'
        return period, 'clip_partido_anterior'
    return period, 'juego_vivo'

def get_context_multiplier(context_type):
    import sys; sys.path.insert(0, '.')
    from config.db import execute_query
    result = execute_query(
        'SELECT multiplicador FROM multiplicadores_contexto WHERE context_type=%s',
        (context_type,)
    )
    return result[0]['multiplicador'] if result else 1.0
