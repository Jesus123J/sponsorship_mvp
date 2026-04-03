"""Whisper transcribe audio y detecta menciones de sponsors."""
import whisper

KEYWORDS = {
    'te_apuesto': ['te apuesto'],
    'apuesta_total': ['apuesta total'],
    'latam': ['latam'],
    'sporade': ['sporade'],
    'doradobet': ['doradobet'],
    'caja_huancayo': ['caja huancayo'],
    'cerveza_cristal': ['cerveza cristal', 'cristal'],
    'caja_piura': ['caja piura'],
    'marathon': ['marathon'],
    'nike': ['nike'],
    'adidas': ['adidas'],
    'indrive': ['indrive'],
    'smart_fit': ['smart fit'],
    'big_cola': ['big cola'],
    'vantage': ['vantage'],
}

def transcribir(video_path, match_id):
    print(f"Cargando Whisper medium (esto tarda ~1 min la primera vez)...")
    model = whisper.load_model('medium')
    print(f"Transcribiendo audio de {video_path}...")
    print(f"  Esto tarda ~2-3 horas en CPU. Dejalo corriendo.")
    result = model.transcribe(video_path, language='es')
    menciones = []
    for seg in result['segments']:
        texto = seg['text'].lower()
        for sponsor_id, kws in KEYWORDS.items():
            for kw in kws:
                if kw in texto:
                    menciones.append({
                        'match_id': match_id,
                        'sponsor_id': sponsor_id,
                        'timestamp_seg': seg['start'],
                        'match_minute': int(seg['start'] / 60),
                        'texto': seg['text'].strip(),
                        'tipo': 'mencion_directa'
                    })
    print(f"LISTO: {len(menciones)} menciones encontradas")
    return menciones, result['segments']

def detectar_goles_audio(segmentos):
    keywords = ['gol', 'golazo', 'anota']
    goles = []
    for seg in segmentos:
        if any(kw in seg['text'].lower() for kw in keywords):
            minuto = seg['start'] / 60
            if not goles or abs(minuto - goles[-1]) > 1:
                goles.append(round(minuto, 1))
    return goles
