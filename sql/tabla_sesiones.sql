USE sponsorship_mvp;

-- TABLA 13: sesiones (tokens activos)
CREATE TABLE IF NOT EXISTS sesiones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,          -- hash del JWT (no guardamos el token raw)
  ip_address VARCHAR(45),                     -- IPv4 o IPv6
  user_agent VARCHAR(500),                    -- navegador/dispositivo
  estado VARCHAR(20) DEFAULT 'activa',        -- activa, cerrada, expirada
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  closed_at TIMESTAMP NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_sesion_token ON sesiones(token_hash, estado);
CREATE INDEX idx_sesion_usuario ON sesiones(usuario_id, estado);
