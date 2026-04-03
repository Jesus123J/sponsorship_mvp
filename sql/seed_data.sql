USE sponsorship_mvp;

-- ENTIDADES (4)
INSERT INTO entidades (entity_id, nombre, nombre_corto, entity_type, color_primario_hsv, color_secundario_hsv, estadio) VALUES
('universitario','Universitario de Deportes','La U','club','[35,60,90]','[0,0,100]','Estadio Monumental'),
('alianza_lima','Alianza Lima','Alianza','club','[220,80,40]','[0,0,100]','Estadio Alejandro Villanueva'),
('sporting_cristal','Sporting Cristal','Cristal','club','[200,70,85]','[0,0,100]','Estadio Alberto Gallardo'),
('liga_1','Liga 1 / L1MAX','Liga 1','league',NULL,NULL,NULL);

-- MULTIPLICADORES DE CONTEXTO (6)
INSERT INTO multiplicadores_contexto VALUES
('pre_partido', 0.60, 'Intro y alineaciones'),
('juego_vivo', 1.00, 'Partido en curso'),
('replay_inmediato', 0.85, 'Jugada reciente'),
('replay_entretiempo_gol', 1.10, 'Replay gol alta atencion'),
('clip_partido_anterior', 0.70, 'Contenido familiar'),
('comercial_liga', 1.00, 'Comerciales formula especial');

-- PARAMETROS DE VALORACION (2)
INSERT INTO parametros_valoracion (temporada, canal, torneo, tipo_partido, cpm_soles, cpm_por_posicion, audiencia_default, cpm_instagram, valor_mencion_directa, valor_mencion_contextual, factor_audiencia_entretiempo, updated_by) VALUES
(2025,'l1max','apertura','clasico',28,'{"camiseta":22,"valla_led":28,"overlay_digital":35,"cenefa":30,"panel_mediocampo":32,"comercial":38}',850000,10,1000,400,0.85,'setup_inicial'),
(2025,'l1max','clausura','regular',25,'{"camiseta":22,"valla_led":28,"overlay_digital":35,"cenefa":30,"panel_mediocampo":32,"comercial":38}',600000,10,1000,400,0.85,'setup_inicial');

-- SPONSORS (~27)
INSERT INTO sponsors (sponsor_id, nombre, categoria, variantes_logo, entidades, tier_mvp, temporada) VALUES
('apuesta_total','Apuesta Total','casa_apuestas','["at_horizontal","at_icono","at_bordado","at_oscuro"]','["universitario","alianza_lima","liga_1"]',1,2025),
('caja_huancayo','Caja Huancayo','banca','["ch_logo","ch_icono"]','["alianza_lima","liga_1"]',1,2025),
('cerveza_cristal','Cerveza Cristal','bebida','["cristal_logo"]','["sporting_cristal","liga_1"]',2,2025),
('sporade','Sporade','bebida','["sporade_logo"]','["sporting_cristal","liga_1"]',1,2025),
('marathon','Marathon','kit_tecnico','["marathon_logo","marathon_texto"]','["universitario"]',2,2025),
('jetour','Jetour','automotriz','["jetour_logo"]','["universitario"]',3,2025),
('bitel','Bitel','telecomunicaciones','["bitel_logo"]','["universitario"]',3,2025),
('electrolight','Electrolight','bebida','["electrolight_logo"]','["universitario"]',3,2025),
('hero_motos','Hero Motos','automotriz','["hero_motos_logo"]','["universitario"]',3,2025),
('opalux','Opalux','iluminacion','["opalux_logo"]','["universitario"]',3,2025),
('movisun','Movisun','energia','["movisun_logo"]','["universitario"]',3,2025),
('nike','Nike','kit_tecnico','["nike_swoosh"]','["alianza_lima"]',2,2025),
('anypsa','ANYPSA','pintura','["anypsa_logo"]','["alianza_lima"]',3,2025),
('movistar','Movistar','telecomunicaciones','["movistar_logo"]','["alianza_lima"]',3,2025),
('loterias_torito','Loterias Torito','apuestas','["torito_logo"]','["alianza_lima"]',3,2025),
('hyundai','Hyundai','automotriz','["hyundai_logo"]','["alianza_lima"]',3,2025),
('doradobet','DoradoBet','casa_apuestas','["doradobet_logo","doradobet_icono"]','["sporting_cristal"]',1,2025),
('caja_piura','Caja Piura','banca','["cp_logo","cp_icono"]','["sporting_cristal"]',1,2025),
('puma','Puma','kit_tecnico','["puma_logo"]','["sporting_cristal"]',2,2025),
('altos','Altos','bebida','["altos_logo"]','["sporting_cristal"]',3,2025),
('gwm','GWM','automotriz','["gwm_logo"]','["sporting_cristal"]',3,2025),
('pago_efectivo','Pago Efectivo','fintech','["pago_efectivo_logo"]','["sporting_cristal"]',3,2025),
('te_apuesto','Te Apuesto','casa_apuestas','["te_apuesto_completo","te_apuesto_icono"]','["liga_1"]',1,2025),
('latam','LATAM','aerolinea','["latam_logo"]','["liga_1"]',1,2025),
('indrive','InDrive','transporte','["indrive_logo"]','["liga_1"]',1,2025),
('smart_fit','Smart Fit','gimnasio','["smart_fit_logo"]','["liga_1"]',1,2025),
('big_cola','Big Cola','bebida','["big_cola_logo"]','["liga_1"]',1,2025),
('adidas','Adidas','deportes','["adidas_logo","adidas_tres_rayas"]','["liga_1"]',1,2025),
('vantage','Vantage','tabaco','["vantage_logo"]','["liga_1"]',2,2025);

-- PARTIDOS MVP (2)
INSERT INTO partidos (match_id, equipo_local, equipo_visitante, torneo, jornada, match_type, fecha, canal, resultado, audiencia_estimada, model_version) VALUES
('alianza_vs_u_apertura_2025_f7','alianza_lima','universitario','apertura',7,'clasico','2025-04-05','l1max','1-1',850000,'yolo_v1.0'),
('cristal_vs_u_clausura_2025','sporting_cristal','universitario','clausura',NULL,'regular',NULL,'l1max','0-1',600000,'yolo_v1.0');
