-- Migracion 003: actualizar colores secundarios de equipos peruanos
-- Mejora la atribucion por color cuando hay 2 colores fuertes en la camiseta.
-- Formato: [H 0-360, S 0-100, V 0-100]

-- Universitario: crema (primario) + marron / cafe oscuro (secundario)
UPDATE entidades SET color_secundario_hsv = '[25,55,35]'
  WHERE entity_id = 'universitario';

-- Alianza Lima: azul oscuro (primario) + blanco (secundario)
UPDATE entidades SET color_secundario_hsv = '[0,0,95]'
  WHERE entity_id = 'alianza_lima';

-- Sporting Cristal: celeste (primario) + blanco (secundario)
UPDATE entidades SET color_secundario_hsv = '[0,0,95]'
  WHERE entity_id = 'sporting_cristal';
