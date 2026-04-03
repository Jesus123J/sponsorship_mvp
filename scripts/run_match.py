"""
Orquestador del pipeline completo — procesa un partido de principio a fin.

Uso:
    python scripts/run_match.py <match_id>

Ejemplo:
    python scripts/run_match.py alianza_vs_u_apertura_2025_f7

Requisitos:
    - Video MP4 en data/videos/<match_id>.mp4
    - Modelo YOLO en data/models/yolo_v1.0/best.pt
    - Partido registrado en tabla 'partidos' de MySQL
"""
import sys
import os
import time

# Agregar raiz del proyecto al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config.db import execute_query, get_connection


def check_prerequisites(match_id):
    """Verifica que todo esta listo antes de correr el pipeline."""
    errors = []

    # Video
    video_path = os.path.join('data', 'videos', f'{match_id}.mp4')
    if not os.path.exists(video_path):
        errors.append(f'Video no encontrado: {video_path}')

    # Modelo
    model_path = os.path.join('data', 'models', 'yolo_v1.0', 'best.pt')
    if not os.path.exists(model_path):
        errors.append(f'Modelo YOLO no encontrado: {model_path}')

    # Partido en BD
    match = execute_query(
        'SELECT match_id FROM partidos WHERE match_id = %s', (match_id,)
    )
    if not match:
        errors.append(f'Partido no registrado en BD: {match_id}')
        print(f'\n  Para registrarlo, inserta en MySQL:')
        print(f'  INSERT INTO partidos (match_id, equipo_local, equipo_visitante, ...)')

    return errors


def step_1_extract_frames(match_id):
    """Extrae frames del video a 1fps."""
    print('\n[1/9] Extrayendo frames a 1fps...')
    from scripts.extraction.extract_frames import extract_frames

    video_path = os.path.join('data', 'videos', f'{match_id}.mp4')
    output_dir = os.path.join('data', 'frames', match_id)
    os.makedirs(output_dir, exist_ok=True)

    count = extract_frames(video_path, output_dir, fps=1)
    print(f'  -> {count} frames extraidos en {output_dir}')
    return count


def step_2_run_yolo(match_id):
    """Detecta logos con YOLO."""
    print('\n[2/9] Detectando logos con YOLO...')
    from scripts.detection.run_yolo import run_detection

    frames_dir = os.path.join('data', 'frames', match_id)
    model_path = os.path.join('data', 'models', 'yolo_v1.0', 'best.pt')

    detections = run_detection(frames_dir, model_path, match_id)
    print(f'  -> {len(detections)} detecciones brutas')
    return detections


def step_3_classify_position(detections):
    """Clasifica posicion del logo: camiseta, valla, overlay, etc."""
    print('\n[3/9] Clasificando posicion del logo...')
    from scripts.detection.classify_position import classify_positions

    result = classify_positions(detections)
    positions = {}
    for d in result:
        p = d.get('position_type', 'unknown')
        positions[p] = positions.get(p, 0) + 1
    print(f'  -> Posiciones: {positions}')
    return result


def step_4_classify_team(detections, match_id):
    """Clasifica equipo por color (K-Means)."""
    print('\n[4/9] Clasificando equipo por color...')
    from scripts.detection.classify_team import classify_teams

    result = classify_teams(detections, match_id)
    print(f'  -> {len(result)} detecciones con equipo asignado')
    return result


def step_5_attribute(detections, match_id):
    """Atribuye entity_id final."""
    print('\n[5/9] Atribuyendo entidad...')
    from scripts.attribution.attribute import attribute_entities

    result = attribute_entities(detections, match_id)
    print(f'  -> {len(result)} detecciones con entidad')
    return result


def step_6_classify_context(match_id):
    """Clasifica contexto: juego_vivo, replay, comercial, etc."""
    print('\n[6/9] Clasificando contexto del video...')
    from scripts.extraction.classify_context import classify_context

    video_path = os.path.join('data', 'videos', f'{match_id}.mp4')
    contexts = classify_context(video_path, match_id)
    print(f'  -> Contextos clasificados: {len(contexts)} segmentos')
    return contexts


def step_7_transcribe_audio(match_id):
    """Transcribe audio para menciones de sponsors."""
    print('\n[7/9] Transcribiendo audio (Whisper)...')
    from scripts.extraction.transcribe_audio import transcribe

    video_path = os.path.join('data', 'videos', f'{match_id}.mp4')
    mentions = transcribe(video_path, match_id)
    print(f'  -> {len(mentions)} menciones de audio detectadas')
    return mentions


def step_8_qi_score(detections):
    """Calcula Quality Index: 6 dimensiones."""
    print('\n[8/9] Calculando Quality Index...')
    from scripts.scoring.qi_score import calculate_qi

    result = calculate_qi(detections)
    avg_qi = sum(d.get('qi_score', 0) for d in result) / max(len(result), 1)
    print(f'  -> QI promedio: {avg_qi:.3f}')
    return result


def step_9_smv(detections, match_id):
    """Calcula SMV en soles y guarda en BD."""
    print('\n[9/9] Calculando SMV y guardando en BD...')
    from scripts.scoring.tee_smv import calculate_and_save_smv

    total_smv = calculate_and_save_smv(detections, match_id)
    print(f'  -> SMV total del partido: S/. {total_smv:,.0f}')
    return total_smv


def run_pipeline(match_id):
    """Ejecuta el pipeline completo para un partido."""
    print('=' * 60)
    print(f'  PIPELINE DE SPONSORSHIP — {match_id}')
    print('=' * 60)

    # Verificar requisitos
    errors = check_prerequisites(match_id)
    if errors:
        print('\nERRORES — no se puede continuar:')
        for e in errors:
            print(f'  x {e}')
        sys.exit(1)

    start = time.time()

    try:
        # Step 1: Extraer frames
        frame_count = step_1_extract_frames(match_id)

        # Step 2: Detectar logos
        detections = step_2_run_yolo(match_id)

        # Step 3: Clasificar posicion
        detections = step_3_classify_position(detections)

        # Step 4: Clasificar equipo
        detections = step_4_classify_team(detections, match_id)

        # Step 5: Atribuir entidad
        detections = step_5_attribute(detections, match_id)

        # Step 6: Clasificar contexto
        step_6_classify_context(match_id)

        # Step 7: Transcribir audio
        step_7_transcribe_audio(match_id)

        # Step 8: Quality Index
        detections = step_8_qi_score(detections)

        # Step 9: SMV
        total_smv = step_9_smv(detections, match_id)

    except ImportError as e:
        print(f'\n  Error de importacion: {e}')
        print(f'  Verifica que el script exista y tenga la funcion correcta.')
        sys.exit(1)

    elapsed = time.time() - start
    print('\n' + '=' * 60)
    print(f'  COMPLETADO en {elapsed / 60:.1f} minutos')
    print(f'  Frames: {frame_count}')
    print(f'  Detecciones: {len(detections)}')
    print(f'  SMV total: S/. {total_smv:,.0f}')
    print('=' * 60)
    print(f'\n  Ahora abre http://localhost:3000 para ver los resultados!')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python scripts/run_match.py <match_id>')
        print('Ejemplo: python scripts/run_match.py alianza_vs_u_apertura_2025_f7')
        sys.exit(1)

    run_pipeline(sys.argv[1])
