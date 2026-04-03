-- Indices compuestos para optimizar las queries mas frecuentes del dashboard
-- Ejecutar una sola vez despues de schema.sql

USE sponsorship_mvp;

-- Query League View: WHERE aprobada=1 AND entity_id='liga_1' GROUP BY sponsor_id
CREATE INDEX idx_det_league ON detecciones(aprobada, entity_id, sponsor_id);

-- Query Property View: WHERE aprobada=1 AND entity_id=? GROUP BY sponsor_id
-- (cubierto por idx_det_league)

-- Query Brand View: WHERE aprobada=1 AND sponsor_id=? GROUP BY entity_id, position_type
CREATE INDEX idx_det_brand ON detecciones(aprobada, sponsor_id, entity_id, position_type);

-- Query Match Sponsors: WHERE match_id=? AND aprobada=1 GROUP BY sponsor_id
CREATE INDEX idx_det_match_approved ON detecciones(match_id, aprobada, sponsor_id);

-- Query SMV total: WHERE aprobada=1 — SUM(smv_parcial)
CREATE INDEX idx_det_smv ON detecciones(aprobada, smv_parcial);

-- Suscripciones activas por usuario
CREATE INDEX idx_sub_active ON suscripciones(usuario_id, estado);

-- Login por email
CREATE INDEX idx_user_email ON usuarios(email);
