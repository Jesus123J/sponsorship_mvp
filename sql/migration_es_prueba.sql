-- Migracion: agregar flag es_prueba a partidos
-- Todo partido auto-creado por el pipeline inicia como prueba (es_prueba=1).
-- El usuario puede promoverlo a real desde el dashboard (es_prueba=0).
-- Los 2 partidos seed (alianza_vs_u, cristal_vs_u) se marcan como prueba
-- porque son solo metadata de ejemplo sin detecciones reales.

ALTER TABLE partidos
  ADD COLUMN IF NOT EXISTS es_prueba TINYINT(1) DEFAULT 1 AFTER model_version;

-- Marcar los partidos seed como prueba (aun no tienen detecciones reales)
UPDATE partidos SET es_prueba = 1
  WHERE match_id IN ('alianza_vs_u_apertura_2025_f7', 'cristal_vs_u_clausura_2025');

-- Indice para filtrar rapido
CREATE INDEX IF NOT EXISTS idx_partidos_prueba ON partidos(es_prueba);
