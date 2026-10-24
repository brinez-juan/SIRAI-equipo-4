-- Feature 42: por qué se justificó una inasistencia. Al marcar AUSENTE_JUSTIFICADO en el pase de lista se guarda
-- el motivo (del catálogo causas_inasistencia) y una nota opcional cifrada con AES-256-GCM (backend/cifrado.js).
-- Con cualquier otro estado las dos columnas quedan en NULL (lo asegura backend/rutas/asistencia.js).
--
-- Se corre una sola vez sobre una base que ya tiene docs/schema.sql:
--   mysql -u root -p sirai < backend/migraciones/42_justificacion_inasistencia.sql

ALTER TABLE `asistencias`
  ADD COLUMN `justificacion_causa_codigo` VARCHAR(20) NULL COMMENT 'Motivo al marcar AUSENTE_JUSTIFICADO' AFTER `estado_codigo`,
  ADD COLUMN `justificacion_cifrado`      TEXT        NULL COMMENT 'Nota del motivo (AES-256-GCM)'      AFTER `justificacion_causa_codigo`,
  ADD KEY `asistencias_justificacion_causa_fkey` (`justificacion_causa_codigo`),
  ADD CONSTRAINT `asistencias_justificacion_causa_fkey` FOREIGN KEY (`justificacion_causa_codigo`)
    REFERENCES `causas_inasistencia` (`codigo`) ON DELETE RESTRICT ON UPDATE RESTRICT;
