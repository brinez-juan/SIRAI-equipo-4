-- =====================================================================
-- SIRAI — Esquema de la base de datos (MySQL 8.0)
--
-- Estado vigente del esquema, sin salas: los infantes pertenecen
-- directamente a una estancia (infantes.estancia_id).
-- Crea la base desde cero. Para actualizar una base que todavía tiene
-- salas, usar docs/eliminar_salas.sql.
--
-- Todas las FK usan RESTRICT: hay soft delete (deleted_at) y MySQL no
-- permite CHECK sobre columnas con FK en CASCADE / SET NULL (error 3823).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `sirai`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `sirai`;

-- usuarios <-> regiones/estancias se referencian mutuamente (created_by).
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- Organización: regiones, estancias y turnos
-- =====================================================================

CREATE TABLE `regiones` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `nombre`     VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` CHAR(36)     NULL,
  `deleted_at` DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `regiones_nombre_key` (`nombre`),
  KEY `regiones_created_by_fkey` (`created_by`),
  CONSTRAINT `regiones_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `estancias` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `region_id`    INT          NOT NULL,
  `clave`        VARCHAR(20)  NOT NULL COMMENT 'Clave institucional de la EBDI',
  `nombre`       VARCHAR(150) NOT NULL,
  `direccion`    VARCHAR(255) NULL,
  `max_sesiones` INT          NOT NULL DEFAULT 10 COMMENT 'Sesiones activas simultáneas permitidas',
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`   CHAR(36)     NULL,
  `deleted_at`   DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `estancias_clave_key` (`clave`),
  KEY `estancias_region_id_fkey` (`region_id`),
  KEY `estancias_created_by_fkey` (`created_by`),
  CONSTRAINT `estancias_region_id_fkey`  FOREIGN KEY (`region_id`)  REFERENCES `regiones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `estancias_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Qué turnos opera cada estancia y a qué hora cierra cada uno.
CREATE TABLE `estancia_turnos` (
  `estancia_id` INT                          NOT NULL,
  `turno`       ENUM('MATUTINO','VESPERTINO') NOT NULL,
  `hora_inicio` TIME                         NOT NULL,
  `hora_cierre` TIME                         NOT NULL DEFAULT '09:00:00' COMMENT 'Hora local del cierre automático',
  `created_at`  DATETIME(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`  CHAR(36)                     NULL,
  `deleted_at`  DATETIME(3)                  NULL,
  PRIMARY KEY (`estancia_id`, `turno`),
  KEY `estancia_turnos_created_by_fkey` (`created_by`),
  CONSTRAINT `estancia_turnos_estancia_id_fkey` FOREIGN KEY (`estancia_id`) REFERENCES `estancias` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `estancia_turnos_created_by_fkey`  FOREIGN KEY (`created_by`)  REFERENCES `usuarios` (`id`)  ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Cuentas, acceso y sesiones
-- =====================================================================

-- estancia_id y region_id son excluyentes según el rol (chk_usuarios_alcance).
CREATE TABLE `usuarios` (
  `id`                CHAR(36)     NOT NULL,
  `nombre`            VARCHAR(100) NOT NULL,
  `primer_apellido`   VARCHAR(100) NOT NULL,
  `segundo_apellido`  VARCHAR(100) NULL,
  `correo`            VARCHAR(150) NOT NULL,
  `password_hash`     VARCHAR(255) NOT NULL COMMENT 'argon2id',
  `rol`               ENUM('DOCENTE','TRABAJO_SOCIAL','MEDICO','DIRECTORA','SUPERVISOR','ADMIN_CENTRAL') NOT NULL,
  `estancia_id`       INT          NULL COMMENT 'Solo roles de estancia',
  `region_id`         INT          NULL COMMENT 'Solo SUPERVISOR regional',
  `activo`            TINYINT(1)   NOT NULL DEFAULT 1,
  `intentos_fallidos` INT          NOT NULL DEFAULT 0,
  `bloqueado_hasta`   DATETIME(3)  NULL,
  `ultimo_acceso_en`  DATETIME(3)  NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`        CHAR(36)     NULL,
  `deleted_at`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuarios_correo_key` (`correo`),
  KEY `usuarios_estancia_id_fkey` (`estancia_id`),
  KEY `usuarios_region_id_fkey` (`region_id`),
  KEY `usuarios_created_by_fkey` (`created_by`),
  CONSTRAINT `usuarios_estancia_id_fkey` FOREIGN KEY (`estancia_id`) REFERENCES `estancias` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `usuarios_region_id_fkey`   FOREIGN KEY (`region_id`)   REFERENCES `regiones` (`id`)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `usuarios_created_by_fkey`  FOREIGN KEY (`created_by`)  REFERENCES `usuarios` (`id`)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_usuarios_alcance` CHECK (
       (`rol` IN ('DOCENTE','TRABAJO_SOCIAL','MEDICO','DIRECTORA') AND `estancia_id` IS NOT NULL AND `region_id` IS NULL)
    OR (`rol` = 'SUPERVISOR'    AND `estancia_id` IS NULL)
    OR (`rol` = 'ADMIN_CENTRAL' AND `estancia_id` IS NULL AND `region_id` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada token vigente y no revocado cuenta como una sesión activa.
CREATE TABLE `refresh_tokens` (
  `id`                 CHAR(36)     NOT NULL,
  `usuario_id`         CHAR(36)     NOT NULL,
  `token_hash`         CHAR(64)     NOT NULL COMMENT 'SHA-256 del refresh token',
  `reemplazado_por_id` CHAR(36)     NULL COMMENT 'Rotación: token que lo sustituyó',
  `ip`                 VARCHAR(45)  NOT NULL,
  `user_agent`         VARCHAR(255) NULL,
  `emitido_en`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expira_en`          DATETIME(3)  NOT NULL,
  `revocado_en`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `refresh_tokens_token_hash_key` (`token_hash`),
  UNIQUE KEY `refresh_tokens_reemplazado_por_id_key` (`reemplazado_por_id`),
  KEY `ix_sesiones_activas` (`usuario_id`, `revocado_en`, `expira_en`),
  CONSTRAINT `refresh_tokens_usuario_id_fkey`         FOREIGN KEY (`usuario_id`)         REFERENCES `usuarios` (`id`)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `refresh_tokens_reemplazado_por_id_fkey` FOREIGN KEY (`reemplazado_por_id`) REFERENCES `refresh_tokens` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Padrón: infantes, tutores, contactos y consentimiento
-- =====================================================================

CREATE TABLE `infantes` (
  `id`                CHAR(36)     NOT NULL,
  `estancia_id`       INT          NOT NULL,
  `matricula`         VARCHAR(30)  NOT NULL,
  `nombre`            VARCHAR(100) NOT NULL,
  `primer_apellido`   VARCHAR(100) NOT NULL,
  `segundo_apellido`  VARCHAR(100) NULL,
  `fecha_nacimiento`  DATE         NOT NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`        CHAR(36)     NULL,
  `deleted_at`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `infantes_matricula_key` (`matricula`),
  KEY `infantes_estancia_id_fkey` (`estancia_id`),
  KEY `infantes_created_by_fkey` (`created_by`),
  CONSTRAINT `infantes_estancia_id_fkey` FOREIGN KEY (`estancia_id`) REFERENCES `estancias` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `infantes_created_by_fkey`  FOREIGN KEY (`created_by`)  REFERENCES `usuarios` (`id`)  ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tutores` (
  `id`                CHAR(36)     NOT NULL,
  `nombre`            VARCHAR(100) NOT NULL,
  `primer_apellido`   VARCHAR(100) NOT NULL,
  `segundo_apellido`  VARCHAR(100) NULL,
  `telefono_cifrado`  VARCHAR(255) NOT NULL,
  `correo`            VARCHAR(150) NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`        CHAR(36)     NULL,
  `deleted_at`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  KEY `tutores_created_by_fkey` (`created_by`),
  CONSTRAINT `tutores_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relación M:N. El parentesco y la autorización dependen del par.
CREATE TABLE `infante_tutor` (
  `infante_id`         CHAR(36)    NOT NULL,
  `tutor_id`           CHAR(36)    NOT NULL,
  `parentesco`         ENUM('MADRE','PADRE','ABUELO_A','TIO_A','HERMANO_A','TUTOR_LEGAL','OTRO') NOT NULL,
  `autorizado_recoger` TINYINT(1)  NOT NULL DEFAULT 0,
  `created_at`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`         CHAR(36)    NULL,
  `deleted_at`         DATETIME(3) NULL,
  PRIMARY KEY (`infante_id`, `tutor_id`),
  KEY `infante_tutor_tutor_id_fkey` (`tutor_id`),
  KEY `infante_tutor_created_by_fkey` (`created_by`),
  CONSTRAINT `infante_tutor_infante_id_fkey` FOREIGN KEY (`infante_id`) REFERENCES `infantes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `infante_tutor_tutor_id_fkey`   FOREIGN KEY (`tutor_id`)   REFERENCES `tutores` (`id`)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `infante_tutor_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contactos_emergencia` (
  `id`               CHAR(36)     NOT NULL,
  `infante_id`       CHAR(36)     NOT NULL,
  `nombre`           VARCHAR(150) NOT NULL,
  `parentesco`       ENUM('MADRE','PADRE','ABUELO_A','TIO_A','HERMANO_A','TUTOR_LEGAL','OTRO') NOT NULL,
  `telefono_cifrado` VARCHAR(255) NOT NULL,
  `prioridad`        TINYINT      NOT NULL COMMENT '1 = primero en llamarse',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`       CHAR(36)     NULL,
  `deleted_at`       DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contactos_emergencia_infante_id_prioridad_key` (`infante_id`, `prioridad`),
  KEY `contactos_emergencia_created_by_fkey` (`created_by`),
  CONSTRAINT `contactos_emergencia_infante_id_fkey` FOREIGN KEY (`infante_id`) REFERENCES `infantes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `contactos_emergencia_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `consentimientos` (
  `id`                         CHAR(36)    NOT NULL,
  `tutor_id`                   CHAR(36)    NOT NULL,
  `version_aviso`              VARCHAR(20) NOT NULL COMMENT 'Versión del aviso de privacidad (ej. 2026.1)',
  `acepta_contacto_telefonico` TINYINT(1)  NOT NULL,
  `aceptado_en`                DATETIME(3) NOT NULL,
  `registrado_por`             CHAR(36)    NOT NULL,
  `created_at`                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`                 CHAR(36)    NULL,
  `deleted_at`                 DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `consentimientos_tutor_id_version_aviso_key` (`tutor_id`, `version_aviso`),
  KEY `consentimientos_registrado_por_fkey` (`registrado_por`),
  KEY `consentimientos_created_by_fkey` (`created_by`),
  CONSTRAINT `consentimientos_tutor_id_fkey`       FOREIGN KEY (`tutor_id`)       REFERENCES `tutores` (`id`)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `consentimientos_registrado_por_fkey` FOREIGN KEY (`registrado_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `consentimientos_created_by_fkey`     FOREIGN KEY (`created_by`)     REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Fase 1: asistencia
-- =====================================================================

-- Catálogo en vez de enum para que "qué estados disparan ticket" sea configurable.
CREATE TABLE `estados_asistencia` (
  `codigo`             VARCHAR(30) NOT NULL,
  `nombre`             VARCHAR(60) NOT NULL,
  `genera_seguimiento` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Si es true, el cierre crea un ticket',
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Llave candidata (estancia_id, infante_id, fecha, turno).
CREATE TABLE `asistencias` (
  `id`               CHAR(36)                     NOT NULL COMMENT 'UUID v7 generado en el cliente (idempotencia del /sync)',
  `estancia_id`      INT                          NOT NULL,
  `infante_id`       CHAR(36)                     NOT NULL,
  `fecha`            DATE                         NOT NULL COMMENT 'Día local America/Mexico_City',
  `turno`            ENUM('MATUTINO','VESPERTINO') NOT NULL,
  `estado_codigo`    VARCHAR(30)                  NOT NULL,
  `hora_entrada`     DATETIME(3)                  NULL,
  `hora_salida`      DATETIME(3)                  NULL,
  `tutor_entrada_id` CHAR(36)                     NULL,
  `tutor_salida_id`  CHAR(36)                     NULL COMMENT 'Debe tener autorizado_recoger = true (service)',
  `capturado_en`     DATETIME(3)                  NOT NULL COMMENT 'Hora real de captura; decide conflictos offline',
  `origen`           ENUM('ONLINE','OFFLINE')     NOT NULL DEFAULT 'ONLINE',
  `created_at`       DATETIME(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`       CHAR(36)                     NOT NULL COMMENT 'Quién capturó',
  `deleted_at`       DATETIME(3)                  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_asistencia_dia` (`estancia_id`, `infante_id`, `fecha`, `turno`),
  KEY `ix_tablero` (`estancia_id`, `fecha`, `turno`),
  KEY `asistencias_estado_codigo_fkey` (`estado_codigo`),
  KEY `asistencias_created_by_fkey` (`created_by`),
  KEY `fk_asistencia_turno` (`estancia_id`, `turno`),
  KEY `fk_tutor_entrada` (`infante_id`, `tutor_entrada_id`),
  KEY `fk_tutor_salida` (`infante_id`, `tutor_salida_id`),
  CONSTRAINT `asistencias_estancia_id_fkey`   FOREIGN KEY (`estancia_id`)   REFERENCES `estancias` (`id`)              ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `asistencias_infante_id_fkey`    FOREIGN KEY (`infante_id`)    REFERENCES `infantes` (`id`)               ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `asistencias_estado_codigo_fkey` FOREIGN KEY (`estado_codigo`) REFERENCES `estados_asistencia` (`codigo`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `asistencias_created_by_fkey`    FOREIGN KEY (`created_by`)    REFERENCES `usuarios` (`id`)               ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- La asistencia solo puede usar un turno que la estancia opere
  CONSTRAINT `fk_asistencia_turno` FOREIGN KEY (`estancia_id`, `turno`) REFERENCES `estancia_turnos` (`estancia_id`, `turno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- El tutor que entrega o recoge debe estar vinculado a ESE infante
  CONSTRAINT `fk_tutor_entrada` FOREIGN KEY (`infante_id`, `tutor_entrada_id`) REFERENCES `infante_tutor` (`infante_id`, `tutor_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_tutor_salida`  FOREIGN KEY (`infante_id`, `tutor_salida_id`)  REFERENCES `infante_tutor` (`infante_id`, `tutor_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_salida_requiere_entrada` CHECK (`hora_salida` IS NULL OR `hora_entrada` IS NOT NULL),
  CONSTRAINT `chk_orden_horas`             CHECK (`hora_salida` IS NULL OR `hora_salida` >= `hora_entrada`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cierres_pase_lista` (
  `id`          CHAR(36)                     NOT NULL,
  `estancia_id` INT                          NOT NULL,
  `fecha`       DATE                         NOT NULL,
  `turno`       ENUM('MATUTINO','VESPERTINO') NOT NULL,
  `cerrado_en`  DATETIME(3)                  NOT NULL,
  `automatico`  TINYINT(1)                   NOT NULL DEFAULT 1,
  `cerrado_por` CHAR(36)                     NULL COMMENT 'NULL si lo cerró el job',
  `created_at`  DATETIME(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`  CHAR(36)                     NULL,
  `deleted_at`  DATETIME(3)                  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cierres_pase_lista_estancia_id_fecha_turno_key` (`estancia_id`, `fecha`, `turno`),
  KEY `fk_cierre_turno` (`estancia_id`, `turno`),
  KEY `cierres_pase_lista_cerrado_por_fkey` (`cerrado_por`),
  KEY `cierres_pase_lista_created_by_fkey` (`created_by`),
  CONSTRAINT `fk_cierre_turno` FOREIGN KEY (`estancia_id`, `turno`) REFERENCES `estancia_turnos` (`estancia_id`, `turno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `cierres_pase_lista_cerrado_por_fkey` FOREIGN KEY (`cerrado_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `cierres_pase_lista_created_by_fkey`  FOREIGN KEY (`created_by`)  REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_cierre_manual_con_usuario` CHECK (`automatico` = TRUE OR `cerrado_por` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Fase 2: seguimiento de inasistencias
-- =====================================================================

CREATE TABLE `causas_inasistencia` (
  `codigo`              VARCHAR(20) NOT NULL,
  `nombre`              VARCHAR(80) NOT NULL,
  `asesoria`            TEXT        NOT NULL COMMENT 'Guion de asesoría que se muestra al personal',
  `requiere_alta`       TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Activa el candado "Requiere alta para ingresar"',
  `justifica_falta`     TINYINT(1)  NOT NULL DEFAULT 0,
  `notifica_emergencia` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'NO_LOC: notificar contactos de emergencia',
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sin infante_id: se obtiene de asistencia_id.
CREATE TABLE `seguimientos` (
  `id`                     CHAR(36)    NOT NULL,
  `asistencia_id`          CHAR(36)    NOT NULL COMMENT 'Un ticket por inasistencia',
  `estado`                 ENUM('ABIERTO','EN_CONTACTO','CLASIFICADO','EN_SEGUIMIENTO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  `causa_codigo`           VARCHAR(20) NULL COMMENT 'NULL hasta clasificar',
  `detalle_causa_cifrado`  TEXT        NULL,
  `fecha_probable_retorno` DATE        NULL,
  `cerrado_en`             DATETIME(3) NULL,
  `cerrado_por`            CHAR(36)    NULL,
  `created_at`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`             CHAR(36)    NULL COMMENT 'NULL cuando lo genera el job de cierre',
  `deleted_at`             DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `seguimientos_asistencia_id_key` (`asistencia_id`),
  KEY `ix_bandeja` (`estado`, `fecha_probable_retorno`),
  KEY `seguimientos_causa_codigo_fkey` (`causa_codigo`),
  KEY `seguimientos_cerrado_por_fkey` (`cerrado_por`),
  KEY `seguimientos_created_by_fkey` (`created_by`),
  CONSTRAINT `seguimientos_asistencia_id_fkey` FOREIGN KEY (`asistencia_id`) REFERENCES `asistencias` (`id`)             ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `seguimientos_causa_codigo_fkey`  FOREIGN KEY (`causa_codigo`)  REFERENCES `causas_inasistencia` (`codigo`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `seguimientos_cerrado_por_fkey`   FOREIGN KEY (`cerrado_por`)   REFERENCES `usuarios` (`id`)                ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `seguimientos_created_by_fkey`    FOREIGN KEY (`created_by`)    REFERENCES `usuarios` (`id`)                ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_cierre_completo`       CHECK ((`estado` = 'CERRADO') = (`cerrado_en` IS NOT NULL AND `cerrado_por` IS NOT NULL)),
  CONSTRAINT `chk_clasificado_con_causa` CHECK (`estado` IN ('ABIERTO','EN_CONTACTO') OR `causa_codigo` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una llamada a un contacto de emergencia es el registro de la notificación NO_LOC.
CREATE TABLE `llamadas` (
  `id`                     CHAR(36)    NOT NULL,
  `seguimiento_id`         CHAR(36)    NOT NULL,
  `intento`                TINYINT     NOT NULL,
  `tutor_id`               CHAR(36)    NULL,
  `contacto_emergencia_id` CHAR(36)    NULL,
  `realizada_en`           DATETIME(3) NOT NULL,
  `realizada_por`          CHAR(36)    NOT NULL,
  `resultado`              ENUM('CONTACTO_EXITOSO','SIN_RESPUESTA','NUMERO_EQUIVOCADO','BUZON') NOT NULL,
  `notas_cifrado`          TEXT        NULL,
  `siguiente_intento_en`   DATETIME(3) NULL COMMENT 'Agenda del reintento; lo lee el job',
  `created_at`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`             CHAR(36)    NULL,
  `deleted_at`             DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `llamadas_seguimiento_id_intento_key` (`seguimiento_id`, `intento`),
  KEY `ix_reintentos` (`siguiente_intento_en`),
  KEY `llamadas_tutor_id_fkey` (`tutor_id`),
  KEY `llamadas_contacto_emergencia_id_fkey` (`contacto_emergencia_id`),
  KEY `llamadas_realizada_por_fkey` (`realizada_por`),
  KEY `llamadas_created_by_fkey` (`created_by`),
  CONSTRAINT `llamadas_seguimiento_id_fkey`         FOREIGN KEY (`seguimiento_id`)         REFERENCES `seguimientos` (`id`)         ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `llamadas_tutor_id_fkey`               FOREIGN KEY (`tutor_id`)               REFERENCES `tutores` (`id`)              ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `llamadas_contacto_emergencia_id_fkey` FOREIGN KEY (`contacto_emergencia_id`) REFERENCES `contactos_emergencia` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `llamadas_realizada_por_fkey`          FOREIGN KEY (`realizada_por`)          REFERENCES `usuarios` (`id`)             ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `llamadas_created_by_fkey`             FOREIGN KEY (`created_by`)             REFERENCES `usuarios` (`id`)             ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_un_destinatario` CHECK ((`tutor_id` IS NULL) <> (`contacto_emergencia_id` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `altas_medicas` (
  `id`                    CHAR(36)    NOT NULL,
  `seguimiento_id`        CHAR(36)    NOT NULL,
  `emitida_por`           CHAR(36)    NOT NULL COMMENT 'MEDICO o DIRECTORA (validado por RBAC)',
  `emitida_en`            DATETIME(3) NOT NULL,
  `folio_justificante`    VARCHAR(50) NULL,
  `observaciones_cifrado` TEXT        NULL,
  `created_at`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`            CHAR(36)    NULL,
  `deleted_at`            DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `altas_medicas_seguimiento_id_key` (`seguimiento_id`),
  KEY `altas_medicas_emitida_por_fkey` (`emitida_por`),
  KEY `altas_medicas_created_by_fkey` (`created_by`),
  CONSTRAINT `altas_medicas_seguimiento_id_fkey` FOREIGN KEY (`seguimiento_id`) REFERENCES `seguimientos` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `altas_medicas_emitida_por_fkey`    FOREIGN KEY (`emitida_por`)    REFERENCES `usuarios` (`id`)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `altas_medicas_created_by_fkey`     FOREIGN KEY (`created_by`)     REFERENCES `usuarios` (`id`)     ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Auditoría inmutable (solo INSERT/SELECT)
-- Sin FK hacia usuarios a propósito: la bitácora sobrevive a cualquier cambio.
-- =====================================================================

CREATE TABLE `audit_log` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `ts`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'UTC',
  `usuario_id` CHAR(36)     NULL COMMENT 'NULL = proceso del sistema (jobs)',
  `rol`        ENUM('DOCENTE','TRABAJO_SOCIAL','MEDICO','DIRECTORA','SUPERVISOR','ADMIN_CENTRAL') NULL COMMENT 'Rol al momento del evento',
  `ip`         VARCHAR(45)  NULL,
  `user_agent` VARCHAR(255) NULL,
  `request_id` CHAR(36)     NULL,
  `accion`     VARCHAR(30)  NOT NULL COMMENT 'CREATE, UPDATE, SOFT_DELETE, READ_CONFIDENCIAL, LOGIN, SYNC_CONFLICT...',
  `entidad`    VARCHAR(50)  NOT NULL,
  `entidad_id` VARCHAR(36)  NOT NULL,
  `antes`      JSON         NULL COMMENT 'Campos cifrados como "[cifrado]"',
  `despues`    JSON         NULL,
  `hash_prev`  CHAR(64)     NULL,
  `hash`       CHAR(64)     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `audit_log_hash_key` (`hash`),
  KEY `ix_audit_entidad` (`entidad`, `entidad_id`),
  KEY `ix_audit_usuario` (`usuario_id`, `ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

DELIMITER $$

CREATE TRIGGER `trg_audit_log_no_update` BEFORE UPDATE ON `audit_log`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log es inmutable'$$

CREATE TRIGGER `trg_audit_log_no_delete` BEFORE DELETE ON `audit_log`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log es inmutable'$$

DELIMITER ;

-- =====================================================================
-- Catálogos
-- =====================================================================

INSERT INTO `estados_asistencia` (`codigo`, `nombre`, `genera_seguimiento`) VALUES
  ('PRESENTE',            'Presente',                    0),
  ('AUSENTE_JUSTIFICADO', 'Ausente justificado',         1),
  ('FALTA_INJUSTIFICADA', 'Falta injustificada',         1),
  ('FILTRO_SANITARIO',    'Rechazo en filtro sanitario', 1),
  ('COMISION_MEDICA',     'Comisión médica',             0);

INSERT INTO `causas_inasistencia` (`codigo`, `nombre`, `asesoria`, `requiere_alta`, `justifica_falta`, `notifica_emergencia`) VALUES
  ('ENF_CASA', 'Enfermedad en casa',
   'Revisar signos de alarma, recomendar reposo y acudir a su clínica de adscripción. Pedir fecha estimada de recuperación.',
   1, 0, 0),
  ('ACC_EXT', 'Accidente fuera del plantel',
   'Orientar sobre rehabilitación y cuidados en sala. Acordar un plan de reincorporación con la familia.',
   1, 0, 0),
  ('PER_TUT', 'Permiso o trámite del tutor',
   'Registrar el motivo del permiso. Recordar el tope de permisos que marca el reglamento.',
   0, 1, 0),
  ('NO_LOC', 'Sin respuesta',
   'Activar la alerta de búsqueda: segundo intento en unas horas y, si sigue sin respuesta, notificar a los contactos de emergencia.',
   0, 0, 1);
