-- [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
-- Las faltas justificadas ya traen su causa del pase de lista (feature 42), así que su seguimiento no se clasifica
-- a mano: desde este cambio backend/cierreTurno.js lo crea CLASIFICADO con ese motivo y su nota. Esto completa los
-- seguimientos que se crearon antes, que siguen sin causa y sin ella no se podrían cerrar (chk_clasificado_con_causa).
-- La nota se copia cifrada tal cual: misma llave y mismo formato (backend/cifrado.js).
--
-- Se corre una sola vez, después de 42_justificacion_inasistencia.sql:
--   mysql -u root -p sirai < backend/migraciones/seguimientos_justificados.sql

UPDATE `seguimientos` s
  JOIN `asistencias` a ON a.`id` = s.`asistencia_id`
SET s.`estado`                = 'CLASIFICADO',
    s.`causa_codigo`          = a.`justificacion_causa_codigo`,
    s.`detalle_causa_cifrado` = a.`justificacion_cifrado`,
    s.`updated_at`            = CURRENT_TIMESTAMP(3)
WHERE s.`causa_codigo` IS NULL
  AND s.`estado` <> 'CERRADO'
  AND a.`justificacion_causa_codigo` IS NOT NULL;
