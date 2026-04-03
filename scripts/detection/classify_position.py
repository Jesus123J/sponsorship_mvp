"""Clasifica posicion del logo: camiseta, valla_led, overlay, cenefa, panel."""

def classify_position(bbox, frame_h, frame_w):
    cx = bbox['x'] + bbox['w'] / 2
    cy = bbox['y'] + bbox['h'] / 2
    if (cx < frame_w * 0.12 or cx > frame_w * 0.88) and \
       (cy < frame_h * 0.20 or cy > frame_h * 0.85):
        return 'overlay_digital'
    if cy < frame_h * 0.18:
        return 'cenefa'
    if cy > frame_h * 0.72 and bbox['w'] > bbox['h'] * 1.8:
        return 'valla_led'
    if cy > frame_h * 0.55 and frame_w * 0.4 < cx < frame_w * 0.6:
        return 'panel_mediocampo'
    return 'camiseta'
