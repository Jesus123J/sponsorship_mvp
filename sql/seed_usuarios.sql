USE sponsorship_mvp;

-- =====================================================
-- PLANES DE SUSCRIPCION
-- =====================================================
INSERT INTO planes (nombre, precio_mensual, precio_anual, max_marcas, max_partidos_mes, incluye_audio, incluye_social, incluye_api, incluye_pdf) VALUES
('Starter',       2500,  24000, 1,  2, 0, 0, 0, 1),
('Professional',  6500,  62400, 3, 99, 1, 0, 0, 1),
('Enterprise',   15000, 144000, 99, 99, 1, 1, 1, 1);

-- =====================================================
-- USUARIOS DE PRUEBA
-- passwords: todos usan 'demo2025' hasheado con bcrypt
-- hash de 'demo2025': $2b$12$LJ3m4ys3Gzf0GhFJvMqOOeQYjAoNcMqo0lNVqkCflMX3EKiQ8W/rG
-- =====================================================
INSERT INTO usuarios (email, password_hash, nombre, rol, sponsor_id) VALUES
-- Admins (Liga / sistema)
('admin@sponsorshipmvp.pe',  '$2b$12$LJ3m4ys3Gzf0GhFJvMqOOeQYjAoNcMqo0lNVqkCflMX3EKiQ8W/rG', 'Administrador Liga 1', 'admin', NULL),
('vania@sponsorshipmvp.pe',  '$2b$12$LJ3m4ys3Gzf0GhFJvMqOOeQYjAoNcMqo0lNVqkCflMX3EKiQ8W/rG', 'Vania Reategui',       'admin', NULL),

-- Clientes (sponsors)
('cliente@apuestatotal.pe',  '$2b$12$LJ3m4ys3Gzf0GhFJvMqOOeQYjAoNcMqo0lNVqkCflMX3EKiQ8W/rG', 'Apuesta Total',       'client', 'apuesta_total'),
('cliente@marathon.pe',      '$2b$12$LJ3m4ys3Gzf0GhFJvMqOOeQYjAoNcMqo0lNVqkCflMX3EKiQ8W/rG', 'Marathon Sports',     'client', 'marathon'),
('cliente@nike.pe',          '$2b$12$LJ3m4ys3Gzf0GhFJvMqOOeQYjAoNcMqo0lNVqkCflMX3EKiQ8W/rG', 'Nike Peru',           'client', 'nike');

-- =====================================================
-- SUSCRIPCIONES DE PRUEBA
-- =====================================================
INSERT INTO suscripciones (usuario_id, plan_id, estado, fecha_inicio, fecha_fin, ciclo) VALUES
(3, 2, 'activa', '2025-03-01', '2025-04-01', 'mensual'),  -- Apuesta Total → Professional
(4, 1, 'activa', '2025-03-01', '2025-04-01', 'mensual'),  -- Marathon → Starter
(5, 3, 'activa', '2025-01-01', '2026-01-01', 'anual');     -- Nike → Enterprise
