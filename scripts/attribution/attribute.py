"""Logica de atribucion: que entidad recibe credito por cada deteccion."""

def atribuir(position_type, context_type, kmeans_result, config):
    # Liga = siempre por posicion
    if position_type in ['panel_mediocampo', 'overlay_digital', 'cenefa']:
        return {'entity_id': 'liga_1', 'entity_type': 'league',
                'localidad': None, 'attribution_rule': 'overlay_liga'}
    if context_type == 'comercial_liga':
        return {'entity_id': 'liga_1', 'entity_type': 'league',
                'localidad': None, 'attribution_rule': 'comercial_liga'}
    # Valla LED = siempre club local
    if position_type == 'valla_led':
        return {'entity_id': config['equipo_local'], 'entity_type': 'club',
                'localidad': 'local', 'attribution_rule': 'valla_local'}
    # Indumentaria = K-Means decide
    if position_type in ['camiseta', 'short', 'medias', 'buzo']:
        if kmeans_result is None:
            return {'entity_id': None, 'entity_type': None,
                    'localidad': None, 'attribution_rule': 'unknown'}
        local = config['equipo_local']
        loc = 'local' if kmeans_result['entity_id'] == local else 'visitante'
        return {'entity_id': kmeans_result['entity_id'], 'entity_type': 'club',
                'localidad': loc, 'attribution_rule': 'jersey_kmeans'}
    return {'entity_id': None, 'entity_type': None,
            'localidad': None, 'attribution_rule': 'unknown'}
