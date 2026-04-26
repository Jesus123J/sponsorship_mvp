-- Migracion 001: flag es_prueba en partidos
-- Permite separar data de prueba de data real en el dashboard.

ALTER TABLE partidos ADD COLUMN es_prueba TINYINT(1) DEFAULT 1 AFTER model_version;

UPDATE partidos SET es_prueba = 1
  WHERE match_id IN ('alianza_vs_u_apertura_2025_f7', 'cristal_vs_u_clausura_2025');

CREATE INDEX idx_partidos_prueba ON partidos(es_prueba);
