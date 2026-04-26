-- Migracion 002: catalogo de estadios y torneos
-- Permite registrar estadios independientes (con capacidad, ciudad, propietario)
-- y torneos (Liga 1, Libertadores, Sudamericana, etc.).
-- Los partidos pueden referenciar torneo_id y estadio_id.

-- ── Tabla ESTADIOS ──
CREATE TABLE IF NOT EXISTS estadios (
  estadio_id VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  ciudad VARCHAR(60),
  pais VARCHAR(60) DEFAULT 'Peru',
  capacidad INT,
  club_propietario_id VARCHAR(50) DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (club_propietario_id) REFERENCES entidades(entity_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Tabla TORNEOS ──
CREATE TABLE IF NOT EXISTS torneos (
  torneo_id VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(40),
  pais VARCHAR(60),
  confederacion VARCHAR(40),
  temporada INT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── FK opcionales en ENTIDADES y PARTIDOS ──
ALTER TABLE entidades ADD COLUMN estadio_id VARCHAR(50) DEFAULT NULL AFTER estadio;
ALTER TABLE partidos ADD COLUMN estadio_id VARCHAR(50) DEFAULT NULL AFTER audiencia_estimada;
ALTER TABLE partidos ADD COLUMN torneo_id VARCHAR(50) DEFAULT NULL AFTER estadio_id;

CREATE INDEX idx_partidos_torneo ON partidos(torneo_id);
CREATE INDEX idx_partidos_estadio ON partidos(estadio_id);

-- ── Seed data: estadios principales Peru ──
INSERT INTO estadios (estadio_id, nombre, ciudad, pais, capacidad, club_propietario_id) VALUES
  ('monumental', 'Estadio Monumental', 'Lima', 'Peru', 80093, 'universitario'),
  ('alejandro_villanueva', 'Estadio Alejandro Villanueva', 'Lima', 'Peru', 33900, 'alianza_lima'),
  ('alberto_gallardo', 'Estadio Alberto Gallardo', 'Lima', 'Peru', 18000, 'sporting_cristal'),
  ('nacional', 'Estadio Nacional', 'Lima', 'Peru', 45000, NULL),
  ('mansiche', 'Estadio Mansiche', 'Trujillo', 'Peru', 25000, NULL);

-- ── Seed data: torneos 2025 ──
INSERT INTO torneos (torneo_id, nombre, tipo, pais, confederacion, temporada) VALUES
  ('liga_1_apertura_2025', 'Liga 1 Apertura 2025', 'liga_local', 'Peru', 'Local', 2025),
  ('liga_1_clausura_2025', 'Liga 1 Clausura 2025', 'liga_local', 'Peru', 'Local', 2025),
  ('copa_libertadores_2025', 'Copa Libertadores 2025', 'copa_internacional', 'Internacional', 'Conmebol', 2025),
  ('copa_sudamericana_2025', 'Copa Sudamericana 2025', 'copa_internacional', 'Internacional', 'Conmebol', 2025),
  ('copa_peru_2025', 'Copa Peru 2025', 'copa_local', 'Peru', 'Local', 2025);

-- ── Vincular entidades existentes con sus estadios ──
UPDATE entidades SET estadio_id = 'monumental' WHERE entity_id = 'universitario';
UPDATE entidades SET estadio_id = 'alejandro_villanueva' WHERE entity_id = 'alianza_lima';
UPDATE entidades SET estadio_id = 'alberto_gallardo' WHERE entity_id = 'sporting_cristal';
