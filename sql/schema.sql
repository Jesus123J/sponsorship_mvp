USE sponsorship_mvp;

-- TABLA 1: entidades
CREATE TABLE IF NOT EXISTS entidades (
  entity_id VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(200),
  nombre_corto VARCHAR(50),
  entity_type VARCHAR(20),
  color_primario_hsv JSON,
  color_secundario_hsv JSON,
  estadio VARCHAR(200),
  activo TINYINT(1) DEFAULT 1
);

-- TABLA 2: sponsors
CREATE TABLE IF NOT EXISTS sponsors (
  sponsor_id VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(200),
  categoria VARCHAR(100),
  categoria_display VARCHAR(100),
  sector VARCHAR(100),
  variantes_logo JSON,
  entidades JSON,
  visible_broadcast TINYINT(1) DEFAULT 1,
  tier_mvp INT,
  temporada INT DEFAULT 2025
);

-- TABLA 3: parametros_valoracion
CREATE TABLE IF NOT EXISTS parametros_valoracion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  temporada INT,
  canal VARCHAR(50),
  torneo VARCHAR(50),
  tipo_partido VARCHAR(50),
  cpm_soles FLOAT,
  cpm_por_posicion JSON,
  audiencia_default INT,
  cpm_instagram FLOAT,
  valor_mencion_directa FLOAT,
  valor_mencion_contextual FLOAT,
  factor_audiencia_entretiempo FLOAT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(100)
);

-- TABLA 4: multiplicadores_contexto
CREATE TABLE IF NOT EXISTS multiplicadores_contexto (
  context_type VARCHAR(50) PRIMARY KEY,
  multiplicador FLOAT,
  descripcion VARCHAR(200)
);

-- TABLA 5: partidos
CREATE TABLE IF NOT EXISTS partidos (
  match_id VARCHAR(100) PRIMARY KEY,
  equipo_local VARCHAR(50),
  equipo_visitante VARCHAR(50),
  torneo VARCHAR(50),
  jornada INT,
  match_type VARCHAR(50),
  fecha DATE,
  canal VARCHAR(50),
  resultado VARCHAR(20),
  audiencia_estimada INT,
  model_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipo_local) REFERENCES entidades(entity_id),
  FOREIGN KEY (equipo_visitante) REFERENCES entidades(entity_id)
);

-- TABLA 6: detecciones (CORE)
CREATE TABLE IF NOT EXISTS detecciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  match_id VARCHAR(100),
  sponsor_id VARCHAR(50),
  entity_id VARCHAR(50),
  entity_type VARCHAR(20),
  localidad VARCHAR(20),
  attribution_rule VARCHAR(50),
  match_period VARCHAR(30),
  match_minute INT,
  match_minute_rating INT,
  frame_number INT,
  timestamp_seg INT,
  position_type VARCHAR(30),
  context_type VARCHAR(40),
  context_multiplier FLOAT,
  bbox JSON,
  confidence FLOAT,
  zona_confianza VARCHAR(20),
  aprobada TINYINT(1),
  tipo_plano VARCHAR(30),
  color_detectado_hsv JSON,
  color_distancia FLOAT,
  attribution_confidence VARCHAR(20),
  qi_tamano FLOAT,
  qi_claridad FLOAT,
  qi_posicion FLOAT,
  qi_momento FLOAT,
  qi_exclusividad FLOAT,
  qi_duracion FLOAT,
  qi_score FLOAT,
  smv_parcial FLOAT,
  model_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES partidos(match_id),
  FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id),
  FOREIGN KEY (entity_id) REFERENCES entidades(entity_id)
);

CREATE INDEX idx_det_match ON detecciones(match_id);
CREATE INDEX idx_det_entity ON detecciones(entity_id);
CREATE INDEX idx_det_sponsor ON detecciones(sponsor_id);
CREATE INDEX idx_det_period ON detecciones(match_period);
CREATE INDEX idx_det_aprobada ON detecciones(aprobada);

-- TABLA 7: menciones_audio
CREATE TABLE IF NOT EXISTS menciones_audio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  match_id VARCHAR(100),
  sponsor_id VARCHAR(50),
  timestamp_seg FLOAT,
  match_minute INT,
  texto TEXT,
  tipo VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES partidos(match_id),
  FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id)
);

-- TABLA 8: comerciales_entretiempo
CREATE TABLE IF NOT EXISTS comerciales_entretiempo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  match_id VARCHAR(100),
  sponsor_id VARCHAR(50),
  inicio_seg INT,
  fin_seg INT,
  duracion_seg INT,
  posicion_en_bloque INT,
  total_spots INT,
  brand_prominence_score FLOAT,
  smv FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES partidos(match_id)
);

-- TABLA 9: recalculo_log
CREATE TABLE IF NOT EXISTS recalculo_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parametro_cambiado VARCHAR(100),
  valor_anterior TEXT,
  valor_nuevo TEXT,
  motivo TEXT,
  registros_afectados INT,
  ejecutado_por VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA 10: usuarios (autenticacion para dashboard)
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'client',  -- 'admin' o 'client'
  sponsor_id VARCHAR(50) NULL,                -- si es client, a que sponsor pertenece
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id)
);

-- TABLA 11: planes (planes de suscripcion)
CREATE TABLE IF NOT EXISTS planes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  precio_mensual FLOAT NOT NULL,
  precio_anual FLOAT,
  max_marcas INT DEFAULT 1,
  max_partidos_mes INT DEFAULT 2,
  incluye_audio TINYINT(1) DEFAULT 0,
  incluye_social TINYINT(1) DEFAULT 0,
  incluye_api TINYINT(1) DEFAULT 0,
  incluye_pdf TINYINT(1) DEFAULT 1,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA 12: suscripciones (que plan tiene cada usuario/sponsor)
CREATE TABLE IF NOT EXISTS suscripciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  plan_id INT NOT NULL,
  estado VARCHAR(20) DEFAULT 'activa',  -- activa, cancelada, vencida
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  ciclo VARCHAR(10) DEFAULT 'mensual',  -- mensual o anual
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (plan_id) REFERENCES planes(id)
);
