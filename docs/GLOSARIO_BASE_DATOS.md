# Glosario de la base de datos · Correduría OS

Documentación de cada tabla, vista, función, trigger y política RLS del esquema PostgreSQL de Moneta. Útil para desarrolladores que se incorporan al proyecto y para auditoría de cumplimiento.

**Esquema**: `public` (excepto auth.* que es de Supabase Auth).
**Engine**: PostgreSQL 17.
**Extensiones**: `uuid-ossp`, `pgcrypto`, `pg_cron`, `pg_net`.

---

## Convenciones generales

- Todas las tablas tienen `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`.
- `created_at TIMESTAMPTZ DEFAULT now() NOT NULL` en todas.
- `updated_at TIMESTAMPTZ` con trigger `fn_set_updated_at()` donde aplica.
- Todas tienen `ENABLE ROW LEVEL SECURITY`.
- Triggers de auditoría `trg_audit_*` que llaman a `fn_audit_trigger()` y escriben en `audit_logs`.

---

# 1. Tablas principales

## `usuarios`
Perfil extendido del usuario más allá de lo que guarda Supabase Auth.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | mismo id que en `auth.users` |
| email | TEXT UNIQUE NOT NULL | login del usuario |
| nombre | TEXT NOT NULL | nombre completo |
| rol | TEXT NOT NULL CHECK (rol IN ('root','admin','jefe_zona','comercial','secretaria','backoffice')) | |
| zona_id | UUID REFERENCES zonas(id) ON DELETE SET NULL | zona asignada (jefe o comercial) |
| jefe_id | UUID REFERENCES usuarios(id) ON DELETE SET NULL | jefe directo |
| telefono | TEXT | |
| foto_url | TEXT | |
| iban_cifrado | TEXT | IBAN del comercial (hoy en texto plano, protegido por RLS; pendiente cifrar con KMS) |
| activo | BOOLEAN DEFAULT TRUE | si false → no puede entrar |
| created_at, updated_at | TIMESTAMPTZ | |

**RLS**:
- SELECT: root, secretaria, jefe_zona, o `id = auth.uid()` ven la fila.
- INSERT: root o (jefe_zona creando un comercial en su zona).
- UPDATE: root, el propio user (su propio perfil), o jefe_zona (comerciales de su zona).
- DELETE: solo root.

## `zonas`
Zonas geográficas/comerciales de la correduría.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT NOT NULL UNIQUE | ej. "Sevilla Centro" |
| descripcion | TEXT | |
| jefe_id | UUID REFERENCES usuarios(id) ON DELETE SET NULL | jefe de la zona |
| created_at | TIMESTAMPTZ | |

**RLS**: SELECT abierto (todos los usuarios autenticados ven todas las zonas). IUD solo root.

## `clientes`
Cartera de clientes de la correduría.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| tipo | TEXT CHECK (tipo IN ('particular','empresa')) | |
| nombre_razon_social | TEXT NOT NULL | |
| nif_cif | TEXT | |
| email | TEXT | |
| telefono | TEXT | |
| direccion | JSONB | `{ calle, numero, ciudad, cp, provincia, pais }` |
| comercial_asignado_id | UUID REFERENCES usuarios(id) ON DELETE SET NULL | comercial dueño del cliente |
| estado | TEXT DEFAULT 'Activo' | Activo / Pendiente doc. / Riesgo fuga / Baja |
| familia | JSONB | `{ conyuge, hijos:[{nombre,edad}], otros }` (v0.6) |
| ingresos | JSONB | `{ mensual_neto, fuente, otros_ingresos }` (v0.6) |
| propiedades | JSONB | `[{tipo,direccion,valor}]` (v0.6) |
| hipoteca | JSONB | `{ entidad, importe, cuota, vencimiento }` (v0.6) |
| dni_url | TEXT | URL al DNI escaneado en Storage (v0.6) |
| notas_internas | TEXT | (v0.6) |
| created_at, updated_at | TIMESTAMPTZ | |

**RLS**:
- SELECT: root, secretaria, jefe_zona (clientes de comerciales de su zona), comercial (sus clientes).
- INSERT: cualquier autenticado. Trigger `trg_auto_asignar_comercial` auto-asigna `comercial_asignado_id = auth.uid()` si el actor es comercial.
- UPDATE/DELETE: root, secretaria, jefe (sus clientes), comercial (sus clientes).

## `polizas`
Pólizas vivas y archivadas.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| cliente_id | UUID REFERENCES clientes(id) ON DELETE CASCADE | |
| numero_poliza | TEXT | |
| ramo | TEXT | Auto, Hogar, Vida, Salud, Comercio, RC, Decesos |
| aseguradora | TEXT | |
| prima_anual | DECIMAL(10,2) | |
| comision_importe | DECIMAL(10,2) | calculado por `fn_calcular_comision()` |
| comision_porcentaje | DECIMAL(5,2) | |
| fecha_emision | DATE | |
| fecha_inicio | DATE | |
| fecha_vencimiento | DATE | |
| estado | TEXT CHECK IN ('activa','cancelada','renovacion') | |
| pdf_url | TEXT | PDF original archivado en Storage |
| datos_extraidos | JSONB | datos crudos extraídos por Gemini |
| created_at, updated_at | TIMESTAMPTZ | |

**RLS**: idéntica a `clientes` (vía join con cliente).

## `polizas_anexos`
Anexos adjuntos a una póliza.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| poliza_id | UUID REFERENCES polizas(id) ON DELETE CASCADE | |
| tipo | TEXT | "documento", "recibo", "siniestro", etc. |
| nombre | TEXT | |
| descripcion | TEXT | |
| file_url | TEXT | URL en Storage |
| created_at | TIMESTAMPTZ | |

## `siniestros`
Siniestros declarados sobre una póliza.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| poliza_id | UUID REFERENCES polizas(id) ON DELETE CASCADE | |
| fecha_ocurrencia | DATE | |
| fecha_apertura | DATE | |
| descripcion | TEXT | |
| importe_estimado | DECIMAL(10,2) | |
| importe_pagado | DECIMAL(10,2) | |
| estado | TEXT | abierto, en peritaje, cerrado, pagado |
| referencia_aseguradora | TEXT | número de expediente |
| created_at, updated_at | TIMESTAMPTZ | |

## `vencimientos`
Vencimientos próximos extraídos automáticamente de las pólizas activas.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| poliza_id | UUID REFERENCES polizas(id) ON DELETE CASCADE | |
| fecha_vencimiento | DATE NOT NULL | |
| estado | TEXT CHECK IN ('pendiente','avisado','renovado','perdido') | |
| fecha_aviso | TIMESTAMPTZ | cuándo se envió el aviso |
| canal_aviso | TEXT | email, sms, whatsapp |
| comercial_id | UUID | quién contactó al cliente |

## `leads`
Pipeline de captación.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT | |
| email, telefono | TEXT | |
| estado | TEXT CHECK IN ('Nuevo','Cualificado','Presupuesto enviado','Cliente','Perdido') | |
| fuente | TEXT | "Web", "Referido", "Campaña LinkedIn", etc. |
| asignado_a | UUID REFERENCES usuarios(id) | |
| notas | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |

## `presupuestos`
Ofertas comerciales a clientes (existentes o leads).

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| cliente_id | UUID REFERENCES clientes(id) | nullable si es para un lead |
| lead_id | UUID REFERENCES leads(id) | |
| ramo | TEXT | |
| aseguradora | TEXT | |
| prima_estimada | DECIMAL(10,2) | |
| estado | TEXT CHECK IN ('borrador','enviado','aceptado','rechazado','convertido') | |
| fecha_envio | TIMESTAMPTZ | |
| poliza_id | UUID REFERENCES polizas(id) | si se convirtió, link a la póliza |
| created_at, updated_at | TIMESTAMPTZ | |

## `comisiones_reportes`
Reportes mensuales de comisiones que envía cada aseguradora.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| aseguradora | TEXT | |
| mes_reportado | TEXT | "2026-05" |
| importe_declarado | DECIMAL(10,2) | |
| importe_calculado | DECIMAL(10,2) | calculado por el sistema |
| diferencia | DECIMAL(10,2) | discrepancia |
| estado | TEXT | 'Conciliado', 'Discrepancia', 'Aprobado', 'Rechazado' |
| created_at | TIMESTAMPTZ | |

## `comisiones_lineas`
Detalle del reporte (cada póliza dentro del reporte mensual).

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| reporte_id | UUID REFERENCES comisiones_reportes(id) ON DELETE CASCADE | |
| numero_poliza | TEXT | |
| tomador | TEXT | nombre del cliente |
| importe_declarado | DECIMAL(10,2) | |
| importe_esperado | DECIMAL(10,2) | |
| diferencia | DECIMAL(10,2) | |
| estado_match | TEXT | 'OK', 'No encontrada', 'Importe diferente' |

## `liquidaciones`
Nóminas mensuales que la correduría paga a cada comercial.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| mes | TEXT | "2026-05" |
| comercial_id | UUID REFERENCES usuarios(id) | |
| total_comisiones | DECIMAL(10,2) | |
| estado | TEXT | 'borrador','aprobada','pagada','cancelada' |
| fecha_pago | DATE | |
| created_at, updated_at | TIMESTAMPTZ | |

## `facturas`
Facturas emitidas por la correduría (a clientes finales o a empresas).

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| numero_factura | TEXT | |
| cliente_id | UUID REFERENCES clientes(id) | |
| poliza_id | UUID REFERENCES polizas(id) | opcional |
| importe_total | DECIMAL(10,2) | con IVA |
| fecha_emision | DATE | |
| fecha_vencimiento | DATE | |
| estado | TEXT CHECK IN ('emitida','pagada','vencida','anulada') | |
| created_at | TIMESTAMPTZ | |

## `comunicaciones`
Historial de todos los contactos con clientes (email, SMS, WhatsApp, llamada).

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| cliente_id | UUID REFERENCES clientes(id) | |
| poliza_id | UUID REFERENCES polizas(id) | nullable |
| tipo | TEXT | email, sms, whatsapp, llamada, nota |
| canal | TEXT | |
| asunto | TEXT | |
| contenido | TEXT | |
| fecha | TIMESTAMPTZ | |
| created_by | UUID REFERENCES usuarios(id) | quién la registró |

## `comunicaciones_plantillas`
Plantillas reutilizables para campañas.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT | |
| canal | TEXT | |
| asunto | TEXT | |
| contenido | TEXT | con placeholders {{nombre}}, {{numero_poliza}}, etc. |
| created_at | TIMESTAMPTZ | |

## `campanas`
Campañas masivas programadas o enviadas.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT | |
| plantilla_id | UUID REFERENCES comunicaciones_plantillas(id) | |
| filtro | JSONB | criterios de selección de destinatarios |
| estado | TEXT | 'borrador','programada','enviando','enviada','cancelada' |
| programada_para | TIMESTAMPTZ | |
| total_destinatarios | INTEGER | |
| created_at | TIMESTAMPTZ | |

## `campana_envios`
Cada envío individual de una campaña.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| campana_id | UUID REFERENCES campanas(id) ON DELETE CASCADE | |
| cliente_id | UUID REFERENCES clientes(id) | |
| destinatario_email | TEXT | |
| resend_id | TEXT | id que devuelve la API de Resend |
| enviado_at | TIMESTAMPTZ | |
| abierto_at | TIMESTAMPTZ | |
| clicked_at | TIMESTAMPTZ | |
| rebotado | BOOLEAN | |

---

# 2. Tablas de v0.6 (cierre matriz Diego)

## `disponibilidad`
Calendario del comercial para coordinación con jefe / secretaria.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| comercial_id | UUID REFERENCES usuarios(id) ON DELETE CASCADE | |
| fecha | DATE NOT NULL | |
| hora_inicio | TIME | |
| hora_fin | TIME | |
| tipo | TEXT CHECK IN ('disponible','ocupado','vacaciones','baja','reunion') | |
| nota | TEXT | |
| UNIQUE (comercial_id, fecha, hora_inicio) | | |

## `reglas_comision`
Reglas configurables para calcular comisiones.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT NOT NULL | |
| ramo | TEXT | nullable = todos |
| aseguradora | TEXT | nullable = todas |
| comercial_id | UUID | nullable = todos |
| porcentaje | DECIMAL(5,2) NOT NULL | |
| bono_fijo | DECIMAL(10,2) DEFAULT 0 | |
| activa | BOOLEAN DEFAULT TRUE | |
| prioridad | INTEGER DEFAULT 100 | mayor = se evalúa antes |
| fecha_desde, fecha_hasta | DATE | vigencia |

Usada por `fn_calcular_comision(poliza_id)`.

## `firmas`
Documentos enviados a firma electrónica.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| poliza_id | UUID REFERENCES polizas(id) ON DELETE CASCADE | |
| presupuesto_id | UUID REFERENCES presupuestos(id) ON DELETE CASCADE | |
| documento_url | TEXT NOT NULL | |
| firmante_email | TEXT NOT NULL | |
| firmante_nombre | TEXT | |
| proveedor | TEXT CHECK IN ('pendiente','docusign','signaturit','validatedid') | |
| proveedor_request_id | TEXT | |
| estado | TEXT CHECK IN ('enviado','visto','firmado','rechazado','expirado','error') | |
| firmado_at | TIMESTAMPTZ | |
| pdf_firmado_url | TEXT | |

## `permisos_granulares`
Override de permisos por rol × recurso × acción.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| rol | TEXT NOT NULL | |
| recurso | TEXT NOT NULL | "comisiones", "facturacion", etc. |
| accion | TEXT NOT NULL | "ver", "crear", "editar", "eliminar", "aprobar" |
| permitido | BOOLEAN NOT NULL DEFAULT TRUE | |
| UNIQUE (rol, recurso, accion) | | |

## `email_eventos`
Eventos recibidos del webhook de Resend.

| Columna | Tipo | Nota |
|---|---|---|
| id | BIGSERIAL PK | |
| recibido_at | TIMESTAMPTZ DEFAULT now() | |
| tipo | TEXT | email.sent, email.delivered, email.opened, email.clicked, email.bounced |
| resend_id | TEXT | id del envío |
| destinatario | TEXT | |
| campana_envio_id | UUID REFERENCES campana_envios(id) ON DELETE SET NULL | |
| payload | JSONB | payload completo del webhook |

---

# 3. Tablas de v0.8 (cierre total)

## `alertas_vencimiento`
Alertas configurables que dispara el cron diario.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT NOT NULL | |
| ramo | TEXT | nullable = todos |
| aseguradora | TEXT | nullable = todas |
| comercial_id | UUID REFERENCES usuarios(id) ON DELETE SET NULL | |
| zona_id | UUID REFERENCES zonas(id) ON DELETE SET NULL | |
| dias_antes | INTEGER NOT NULL DEFAULT 30 CHECK (BETWEEN 1 AND 365) | |
| canal | TEXT CHECK IN ('email','sms','whatsapp','sistema') | |
| destinatarios | TEXT[] | emails o teléfonos extra |
| activa | BOOLEAN DEFAULT TRUE | |
| ultima_ejecucion | TIMESTAMPTZ | |

## `integraciones_aseguradoras`
Credenciales para conectar con cada aseguradora.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| aseguradora | TEXT NOT NULL | Mapfre, Allianz, Axa, etc. |
| api_key | TEXT | cifrado pendiente |
| api_endpoint | TEXT | |
| estado | TEXT CHECK IN ('inactiva','sandbox','produccion','error') | |
| ultima_prueba | TIMESTAMPTZ | |
| notas | TEXT | |

## `aprobaciones`
Solicitudes jefe → root.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| tipo | TEXT | 'desactivar_comercial','eliminar_cliente','cambio_rol','otro' |
| solicitante_id | UUID REFERENCES usuarios(id) ON DELETE SET NULL | |
| target_user_id | UUID REFERENCES usuarios(id) ON DELETE SET NULL | |
| target_cliente_id | UUID REFERENCES clientes(id) ON DELETE SET NULL | |
| payload | JSONB | datos extra (nuevo_rol, etc.) |
| motivo | TEXT NOT NULL | |
| estado | TEXT CHECK IN ('pendiente','aprobada','rechazada') | |
| resuelto_por | UUID REFERENCES usuarios(id) ON DELETE SET NULL | |
| resuelto_at | TIMESTAMPTZ | |
| comentario_resolucion | TEXT | |

## `webhook_endpoints`
Webhooks salientes configurados.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| nombre | TEXT NOT NULL | |
| url | TEXT NOT NULL | |
| eventos | TEXT[] | array de eventos a los que escucha |
| activo | BOOLEAN DEFAULT TRUE | |
| ultima_respuesta | INTEGER | HTTP status code |
| invocaciones_totales | INTEGER | |
| invocaciones_fallidas | INTEGER | |

---

# 4. Tablas de v0.9 (dashboard custom + constructor reportes)

## `dashboard_widgets`
Widgets que cada usuario añade a su `/mi-dashboard`.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| user_id | UUID REFERENCES usuarios(id) ON DELETE CASCADE | |
| widget_type | TEXT NOT NULL | 'kpi_polizas', 'top_clientes', 'ranking_aseguradoras', etc. |
| position | INTEGER DEFAULT 0 | orden en la grilla |
| size | TEXT CHECK IN ('small','medium','large','full') | |
| config | JSONB | parámetros extra |
| visible | BOOLEAN DEFAULT TRUE | |

**RLS**: user_id = auth.uid() o root.

## `reportes_personalizados`
Plantillas guardadas del constructor visual de reportes.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| user_id | UUID REFERENCES usuarios(id) ON DELETE CASCADE | |
| nombre | TEXT NOT NULL | |
| descripcion | TEXT | |
| entidad | TEXT CHECK IN ('polizas','clientes','vencimientos','leads','comisiones','presupuestos','facturas','liquidaciones','siniestros','comunicaciones') | |
| columnas | TEXT[] NOT NULL | nombres de columnas a exportar |
| filtros | JSONB | `[{ campo, operador, valor }]` |
| orden | JSONB | `[{ campo, direccion }]` |
| compartido | BOOLEAN DEFAULT FALSE | si true → visible para todos |
| ultima_ejecucion | TIMESTAMPTZ | |

**RLS**: SELECT si user_id = auth.uid() OR compartido OR root. Insert solo el creador. Update/delete creador o root.

---

# 5. Audit logs

## `audit_logs`
Tabla append-only que registra cada cambio en cualquier tabla con audit habilitado.

| Columna | Tipo | Nota |
|---|---|---|
| id | UUID PK | |
| occurred_at | TIMESTAMPTZ DEFAULT now() | |
| table_name | TEXT NOT NULL | |
| record_id | TEXT | id de la fila afectada |
| action | TEXT CHECK IN ('INSERT','UPDATE','DELETE') | |
| actor_id | UUID | quién hizo la operación (auth.uid()) |
| actor_email | TEXT | snapshot del email en el momento |
| actor_role | TEXT | snapshot del rol |
| ip | TEXT | IP capturada via app.audit_ip |
| user_agent | TEXT | navegador / app |
| diff | JSONB | { old: {...}, new: {...} } |

**Característica clave**: la tabla tiene `REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated, service_role` — **nadie** puede modificar registros pasados. Append-only puro.

**Cómo se llenan IP y user_agent**: el cliente llama a la edge function `audit-with-ip` que invoca la RPC `audit_perform()`. Esta hace `set_config('app.audit_ip', ...)` + la mutación en la MISMA transacción. El trigger `fn_audit_trigger()` lee esos `app.audit_ip` y los persiste.

---

# 6. Vistas

## `vw_ventas_por_ramo` (v0.8)
Agregado de pólizas por ramo: total pólizas, pólizas activas, prima total, comisión total.

## `vw_ventas_por_aseguradora` (v0.8)
Agregado por aseguradora con `rentabilidad_pct = comision_total / prima_total * 100`.

## `vw_ventas_por_comercial` (v0.8)
Cada comercial con su número de clientes, pólizas, prima total, comisión total.

## `vw_tendencia_mensual` (v0.8)
Pólizas creadas por mes en los últimos 12 meses. Útil para gráficas de tendencia.

## `usuarios_publicos` (v0.6)
Vista de `usuarios` con IBAN enmascarado para no-root y no-self:
```sql
CASE
  WHEN id = auth.uid() OR public.es_root() THEN iban_cifrado
  WHEN iban_cifrado IS NULL THEN NULL
  ELSE '••••' || RIGHT(iban_cifrado, 4)
END AS iban_visible
```
La secretaria ve esta vista, no la tabla `usuarios` directa.

---

# 7. Funciones (PL/pgSQL y SQL)

## Helpers de rol (SECURITY DEFINER STABLE)

```sql
public.mi_rol() RETURNS TEXT
public.mi_zona() RETURNS UUID
public.es_root() RETURNS BOOLEAN  -- rol IN ('root','admin')
public.es_secretaria() RETURNS BOOLEAN
public.es_jefe_zona() RETURNS BOOLEAN
public.es_comercial() RETURNS BOOLEAN
public.mis_comerciales_ids() RETURNS SETOF UUID
```
Se usan en las políticas RLS de prácticamente todas las tablas. Son `SECURITY DEFINER` para bypasear la RLS de `usuarios` cuando se evalúan a sí mismas (evitan recursión).

## `fn_set_updated_at()` (TRIGGER FUNCTION)
Pone `NEW.updated_at = now()` antes de cada UPDATE. Trigger en todas las tablas con `updated_at`.

## `fn_audit_trigger()` (TRIGGER FUNCTION)
Después de INSERT/UPDATE/DELETE en una tabla con audit habilitado:
1. Lee `auth.uid()`, busca email + rol en `usuarios`.
2. Lee `app.audit_ip` y `app.audit_ua` (variables de sesión).
3. Calcula el `diff` (qué cambió).
4. INSERT en `audit_logs`.

## `fn_install_audit(table_name TEXT)`
Helper para instalar el trigger de audit en una tabla nueva. Uso: `SELECT fn_install_audit('mi_tabla');`

## `fn_auto_asignar_comercial()` (TRIGGER FUNCTION, v0.6)
Before INSERT en `clientes`: si el actor es comercial y no se especifica `comercial_asignado_id`, le asigna `auth.uid()`.

## `fn_calcular_comision(poliza_id UUID) RETURNS DECIMAL` (v0.6)
Busca la regla aplicable en `reglas_comision` (filtrando por ramo, aseguradora, comercial, fechas) ordenando por prioridad descendente. Devuelve `prima_anual * porcentaje / 100 + bono_fijo`.

## `set_audit_context(p_ip TEXT, p_user_agent TEXT) RETURNS VOID` (v0.7)
Setea las variables de sesión `app.audit_ip` y `app.audit_ua`. Limitación: solo viven en la transacción actual con `is_local=true`, por eso se usa `audit_perform` en lugar de set_audit_context + mutación separada.

## `audit_perform(p_action, p_table, p_row, p_match, p_ip, p_ua) RETURNS JSONB` (v0.9)
RPC que hace `set_config` + INSERT/UPDATE/DELETE en una sola transacción atómica. Es lo que llama la edge function `audit-with-ip`. Garantiza que `audit_logs.ip` se popula correctamente.

---

# 8. Triggers

Cada tabla con auditoría tiene:
- `trg_<tabla>_updated` BEFORE UPDATE → `fn_set_updated_at()`
- `trg_audit_<tabla>` AFTER INSERT/UPDATE/DELETE → `fn_audit_trigger()`

Tabla `clientes` además tiene:
- `trg_auto_asignar_comercial` BEFORE INSERT → `fn_auto_asignar_comercial()`

---

# 9. Cron jobs

## `avisar_vencimientos_diario`
Schedule: `0 8 * * *` (todos los días a las 08:00 UTC).
Acción: `net.http_post` a `https://<project>.supabase.co/functions/v1/enviar-aviso-vencimiento` con `Authorization: Bearer <service_role_key>`.
La Edge Function lee `alertas_vencimiento` y envía emails vía Resend según las reglas.

Gestionado con extensión `pg_cron` + `pg_net`. Visible en `cron.job`.

---

# 10. Extensiones instaladas

- `uuid-ossp` — `uuid_generate_v4()`
- `pgcrypto` — funciones de cifrado / hash
- `pg_cron` — cron scheduler
- `pg_net` — peticiones HTTP desde SQL

---

# 11. Bucket de Storage

- `documentos` — PDFs de pólizas, DNIs, anexos, facturas.
- `fotos-perfil` — fotos de avatar de usuarios.

Políticas: el usuario solo lee/escribe en su carpeta (`folder = auth.uid()::text`).

---

# 12. Diagrama lógico (resumido)

```
usuarios ──────── jefe_id (self)
   │
   │ zona_id
   ▼
zonas ──── jefe_id ───► usuarios

usuarios ──┐
           │ comercial_asignado_id
           ▼
       clientes ────► polizas ────► polizas_anexos
           │              │
           │              ├──► siniestros
           │              ├──► vencimientos
           │              ├──► firmas
           │              ▼
           │           comisiones_reportes ──► comisiones_lineas
           │              │
           │              ▼
           │          liquidaciones
           │
           ├──► presupuestos ──► firmas
           ├──► comunicaciones ──► comunicaciones_plantillas
           └──► leads
                    │
                    ▼
                campanas ──► campana_envios ──► email_eventos

usuarios ──► aprobaciones ──► resuelto_por usuarios

usuarios ──► dashboard_widgets
         ──► reportes_personalizados
         ──► disponibilidad

(Todas las tablas) ──── trigger fn_audit_trigger ──► audit_logs
```

---

Versión: **v1.0 · 2026-05-28**
Sistema: **Correduría OS · Moneta Seguros · v0.9 + dashboard customizable + constructor reportes**
