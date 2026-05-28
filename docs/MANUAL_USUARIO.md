# Manual de usuario · Correduría OS (Moneta Seguros)

URL de producción: <https://tanstack-start-app.makeflowia.workers.dev>

Este manual cubre los 4 roles del sistema (Root, Jefe de zona, Comercial, Secretaria), cómo entrar, qué hace cada uno, y los pasos exactos para las tareas más frecuentes.

---

## Cómo entrar al sistema

1. Abrir la URL en un navegador moderno (Chrome, Edge, Firefox, Safari).
2. Introducir email y contraseña que te facilitó el administrador.
3. Si activaste 2FA (autenticación en dos pasos), introducir el código de 6 dígitos de tu app autenticadora.
4. La primera vez recomendamos cambiar la contraseña en `Configuración → Mi perfil`.

Si olvidas la contraseña, pide al administrador (Root) que te la resetee desde `Configuración → Usuarios y equipo → tu fila → Resetear password`.

---

## Roles y a qué pantalla aterrizas

| Rol | Pantalla inicial | Qué ves |
|---|---|---|
| **Root** | `/` Panel | Visión global de toda la correduría |
| **Jefe de zona** | `/dashboard-zona` | Dashboard de tu zona |
| **Comercial** | `/mi-panel` | Panel privado con tu actividad |
| **Secretaria** | `/` Panel | Listado de todas las pólizas y vencimientos |

---

# 1. Manual del ROOT (administrador total)

Tu rol controla todo. Eres el único que puede crear usuarios, modificar comisiones, ver auditoría y configurar el sistema.

## 1.1 Dar de alta a un nuevo comercial

1. `Configuración → Usuarios y equipo`
2. Botón **+ Nuevo usuario** (arriba derecha).
3. Rellena:
   - Email (debe ser único — no aceptes correos compartidos).
   - Nombre completo.
   - Rol: `comercial`.
   - Zona: la zona a la que pertenece (debe existir; si no, créala primero en `Configuración → Zonas comerciales`).
   - Jefe directo (opcional): el jefe de zona del que depende.
   - Teléfono.
   - Contraseña inicial (mínimo 8 caracteres). El sistema NO te la guarda en texto plano — apunta esta password porque solo se muestra una vez.
4. Botón **Crear usuario**. El sistema lo crea en Supabase Auth con email confirmado y le inserta la fila en `usuarios`.
5. Envía al comercial el email + password por canal seguro (WhatsApp privado, email cifrado). Recomiéndale que entre y cambie la contraseña inmediatamente.

## 1.2 Configurar reglas de comisión

Las reglas definen el porcentaje que la correduría paga a cada comercial por póliza.

1. `Configuración → Reglas comisión`
2. **+ Nueva regla**
3. Rellena:
   - Nombre descriptivo (ej. "Default Auto").
   - Ramo (Auto, Vida, Salud, Hogar, etc. o vacío = todos).
   - Aseguradora (Mapfre, Allianz, Axa, etc. o vacío = todas).
   - Comercial específico (opcional — si dejas vacío aplica a todos).
   - Porcentaje (ej. 10 para 10%).
   - Bono fijo (ej. 5 para 5€ extra por póliza).
   - Prioridad (mayor = se evalúa antes). Útil cuando hay reglas que se solapan.
   - Fecha desde / hasta (opcional — para reglas temporales).
4. **Guardar**.

El sistema usa la función SQL `fn_calcular_comision()` que busca la regla más específica que aplica a cada póliza y devuelve `prima_anual * porcentaje / 100 + bono_fijo`.

## 1.3 Aprobar comisiones del mes

1. `/comisiones` → Tab **Reportes**
2. Verás los reportes mensuales subidos por las aseguradoras o cargados manualmente.
3. Para cada uno: revisa la columna "Discrepancia" (diferencia entre lo declarado y lo calculado por el sistema).
4. Botón **Aprobar** o **Rechazar** con motivo.
5. Aprobado → genera la liquidación mensual automáticamente.

## 1.4 Generar liquidación mensual

1. `/liquidaciones`
2. **+ Nueva liquidación**
3. Selecciona mes y comercial(es).
4. El sistema calcula automáticamente las comisiones a pagar usando las reglas activas.
5. Exporta a Excel para tu gestoría (formato A3 / Contasol compatible).

## 1.5 Ver auditoría completa

1. `Configuración` → Tab **Auditoría**
2. Verás las últimas 40 operaciones: quién, cuándo, desde qué IP, qué cambió.
3. Cada registro incluye `actor_email`, `IP`, `user_agent`, `diff` (qué campos cambiaron).
4. La tabla es **append-only**: nadie (ni siquiera tú) puede modificar o borrar registros pasados.

## 1.6 Resolver aprobaciones pendientes

Cuando un jefe de zona desactiva un comercial, requiere tu aprobación.

1. `/aprobaciones`
2. Verás solicitudes pendientes con motivo.
3. Botón **✓** (aprobar) o **✗** (rechazar).
4. Aprobada → se ejecuta el cambio (ej. desactivar comercial) automáticamente.

## 1.7 Configurar alertas de vencimiento

1. `Configuración → Alertas vencimientos`
2. **+ Nueva alerta**
3. Define: ramo + aseguradora + comercial/zona + días antes + canal (email/SMS/WhatsApp/sistema) + destinatarios extra.
4. El cron diario (8:00 UTC = 10:00 hora de Madrid en verano) las ejecuta automáticamente.

## 1.8 Configurar integraciones con aseguradoras

1. `Configuración → Integraciones aseguradoras`
2. Para cada aseguradora con la que tengas contrato: edita la fila y pega API key + endpoint.
3. Marca el estado: `sandbox` (pruebas) o `produccion`.
4. Cuando esté en producción, el tarificador `/tarificador` empieza a usar esa API para cotizaciones reales.

## 1.9 Configurar webhooks salientes

Para integrar Moneta con otros sistemas (gestoría, ERP, CRM externo).

1. `Configuración → Webhooks`
2. **+ Nuevo webhook**
3. Define URL destino, eventos a suscribir (ej. `poliza.creada`, `cliente.actualizado`, `comision.aprobada`).
4. Cuando ocurra el evento, el sistema envía POST con el payload a tu URL.

---

# 2. Manual del JEFE DE ZONA

Gestionas tu zona: tu equipo de comerciales y los clientes de esos comerciales. NO ves comerciales/clientes de otras zonas.

## 2.1 Dar de alta un comercial nuevo en tu zona

1. `Configuración → Usuarios y equipo`
2. **+ Nuevo usuario**.
3. Rol: `comercial` (no puedes asignar otro rol).
4. Zona: la tuya (el sistema la fija automáticamente).
5. Jefe directo: tú.
6. Resto igual que el flujo de Root.

## 2.2 Desactivar un comercial (requiere aprobación)

Si un comercial deja la empresa o necesitas suspender su acceso:

1. `Configuración → Usuarios y equipo` → buscar al comercial.
2. Botón de **Desactivar** (icono X) en su fila.
3. El sistema te pide motivo (mín 5 caracteres).
4. Se crea una solicitud en `/aprobaciones` que el Root resuelve.
5. Si Root aprueba, el comercial pierde acceso.

## 2.3 Ver el dashboard de tu zona

1. `/dashboard-zona`
2. KPIs de tu zona: total comerciales, total clientes bajo el equipo, pólizas activas, prima total anual.
3. Ranking de tus comerciales (por prima).
4. Top 5 clientes de tu zona.

## 2.4 Ver caducidades de tu zona

1. `/vencimientos`
2. Verás solo vencimientos de pólizas de clientes de tu zona (RLS lo filtra automáticamente).
3. Botón **Renovar** o **Enviar aviso**.

## 2.5 Ver comisiones de tus comerciales

1. `/comisiones`
2. Solo verás las comisiones de los comerciales de tu zona.
3. NO puedes modificarlas. Si detectas error, usa el botón **Reportar discrepancia** que crea una solicitud al Root.

## 2.6 Enviar campaña a tu zona

1. `/comunicaciones`
2. **Nueva campaña**.
3. Filtro: el sistema te restringe a "Mis comerciales" + "Clientes de mi zona".
4. Plantilla → personalizar → enviar.

---

# 3. Manual del COMERCIAL / VENDEDOR

Tu rol es operativo: gestionar tus clientes, tus pólizas, tus comisiones. Solo ves lo tuyo.

## 3.1 Tu panel privado

1. `/mi-panel` es tu pantalla principal.
2. Verás:
   - Foto e información de contacto.
   - Datos bancarios (IBAN — para domiciliación de comisiones).
   - Comisiones del mes en curso (importe exacto).
   - Top 5 mejores clientes (por prima anual).
   - Tu ranking en la zona.
   - Comparativa de ventas vs mes anterior.
   - Tus clientes que vencen próximamente (top 3).

## 3.2 Crear un cliente nuevo

1. `/clientes`
2. **+ Nuevo cliente**.
3. Rellena nombre, tipo (particular/empresa), NIF/CIF, email, teléfono.
4. **Guardar**. El sistema te asigna automáticamente como `comercial_asignado_id` (no tienes que elegirlo).
5. Click en el cliente → se abre `/clientes/$id` con su ficha 360° donde puedes:
   - Subir su DNI escaneado.
   - Añadir notas internas.
   - Registrar datos familiares, ingresos, propiedades, hipoteca.

## 3.3 Crear un presupuesto

1. `/presupuestos`
2. **+ Nuevo presupuesto**.
3. Selecciona cliente (solo aparecerán los tuyos).
4. Selecciona ramo + aseguradora deseada.
5. Si la aseguradora tiene API configurada → el tarificador devuelve precios reales. Si no → introduces el importe manualmente.
6. **Enviar al cliente** por email o WhatsApp directamente desde la plataforma.
7. Estado pasa a "Enviado". Cuando el cliente acepte, lo conviertes en póliza.

## 3.4 Crear una póliza

Dos opciones:

**A. Manual**:
1. `/polizas` → **+ Alta manual**.
2. Rellena: cliente, número póliza, ramo, aseguradora, prima, fecha inicio, fecha vencimiento.
3. **Guardar**.

**B. Con IA desde PDF**:
1. `/polizas` → **Subir PDF aseguradora**.
2. Arrastra el PDF que te envió Mapfre/Allianz/Axa.
3. El sistema usa Gemini para extraer: número póliza, ramo, aseguradora, prima, fecha vencimiento, cliente, NIF.
4. Revisa los datos extraídos → confirma → se crea la póliza.

## 3.5 Ver tus comisiones

1. `/comisiones`
2. Verás solo tus comisiones (las que has generado tú).
3. Estado de cada una: pendiente / aprobada / pagada.
4. Histórico de los últimos 12 meses.
5. Botón **Descargar justificante** (PDF) en cada liquidación pagada.

## 3.6 Ver vencimientos próximos

1. `/vencimientos`
2. Verás solo vencimientos de tus clientes.
3. Filtros: próximos 7 días / 30 días / 60 días.
4. Botón **Renovar** → te lleva al alta de póliza pre-rellenada con los datos del cliente y la póliza anterior.
5. Botón **Enviar aviso** → envía email al cliente con el recordatorio.

## 3.7 Calendario de disponibilidad

1. `/mi-panel/disponibilidad`
2. Marca tus horarios libres / ocupados / vacaciones / bajas.
3. El jefe de zona y la secretaria ven este calendario para coordinar.

---

# 4. Manual de la SECRETARIA

Tu rol es de soporte. Ves a todos los clientes y todas las pólizas, pero **no** ves datos financieros sensibles (comisiones, IBAN).

## 4.1 Buscar un cliente

1. `/clientes`
2. Caja de búsqueda arriba (busca por nombre, NIF, email).
3. Filtros por tipo (particular/empresa) y por estado.
4. Click en la fila → ficha completa.

## 4.2 Ayudar a un comercial que llama

Si un comercial te llama: "Oye, mírame la ficha de Juan García Pérez":

1. `/clientes` → buscar "Juan García"
2. Ficha completa abierta → le lees por teléfono lo que necesite (pólizas activas, vencimientos, datos de contacto).
3. **NO** verás su comisión ni su IBAN.

## 4.3 Enviar notificaciones de vencimiento

1. `/vencimientos`
2. Filtra por días (ej. próximos 30 días).
3. Selecciona los clientes a notificar.
4. **Enviar aviso masivo** → email automático con el template estándar.
5. El sistema registra cada envío en `comunicaciones` (historial trazable).

## 4.4 Subir documentación de un cliente

1. `/clientes/$id`
2. Sección **Documentos** → arrastrar el archivo.
3. Tipos: DNI, contrato firmado, recibo, justificante.
4. Queda guardado en Supabase Storage.

## 4.5 Generar reportes operacionales

1. `/reportes`
2. Los reportes que SÍ puedes generar:
   - Documentación pendiente (clientes sin DNI o sin email).
   - Seguimiento de clientes (sin actividad > 60 días).
   - Caducidades por zona / comercial.
3. NO podrás generar reportes financieros ni de comisiones.

---

# 5. Acciones comunes a todos los roles

## 5.1 Cambiar tu contraseña

1. `Configuración → Mi perfil`
2. Sección **Cambiar contraseña** → introduce la actual + la nueva (2 veces) → **Guardar**.

## 5.2 Activar autenticación en dos pasos (2FA)

1. `Configuración → Mi perfil` → Sección **Seguridad**.
2. **Activar 2FA**.
3. Escanea el QR con Google Authenticator / Authy / Microsoft Authenticator.
4. Introduce el código de 6 dígitos para confirmar.
5. A partir de ahí, cada login requiere el código de la app.

## 5.3 Cerrar sesión

Click en tu avatar abajo a la izquierda del sidebar → icono de salida.

## 5.4 Instalar como aplicación (PWA)

Chrome / Edge en escritorio:
1. Barra de direcciones → icono de instalar.
2. La app se abre en ventana propia sin barras del navegador.

Móvil:
1. Safari / Chrome → menú **Compartir** → **Añadir a pantalla de inicio**.
2. Aparece icono en tu escritorio del móvil.

---

# 6. Atajos del menú lateral (Sidebar)

| Icono | Ruta | Para quién |
|---|---|---|
| 🏠 Panel | `/` | Root, Secretaria |
| ⊞ Mi dashboard | `/mi-dashboard` | Todos |
| 👤 Mi panel | `/mi-panel` | Comercial |
| 🗺 Dashboard zona | `/dashboard-zona` | Jefe de zona |
| 👥 Mi equipo | `/equipo` | Root, Jefe zona |
| 👥 Clientes | `/clientes` | Todos según RLS |
| 📄 Pólizas | `/polizas` | Todos según RLS |
| 📅 Vencimientos | `/vencimientos` | Todos según RLS |
| 💰 Comisiones | `/comisiones` | Root, Jefe zona, Comercial |
| 🧾 Facturación | `/facturacion` | Root, Jefe zona |
| 📈 Captación | `/captacion` | Todos |
| 📊 Análisis | `/analisis` | Root, Jefe zona |
| 📝 Presupuestos | `/presupuestos` | Root, Jefe zona, Comercial |
| 🧮 Tarificador | `/tarificador` | Root, Jefe zona, Comercial |
| ✉ Comunicaciones | `/comunicaciones` | Root, Jefe zona |
| 💵 Liquidaciones | `/liquidaciones` | Root |
| ✍ Firmas | `/firmas` | Root, Jefe zona, Comercial |
| 📊 Reportes | `/reportes` | Root, Jefe zona |
| 🪄 Constructor reportes | `/reportes/constructor` | Root, Jefe zona |
| ✓ Aprobaciones | `/aprobaciones` | Root, Jefe zona, Secretaria |
| ⚙ Configuración | `/configuracion` | Root principalmente |

---

# 7. FAQ rápido

**¿Dónde está el botón "+ Crear" que no veo?**
Los botones de crear están arriba a la derecha de cada listado, junto al título de la sección. Si no aparece es porque tu rol no tiene permiso para crear ese recurso.

**Me sale "Sin acceso" al entrar a una sección.**
Tu rol no tiene permiso para esa pantalla. Habla con el Root para que ajuste tus permisos granulares si necesitas acceso por excepción.

**No veo un cliente que sé que existe.**
Solo puedes ver los que tu rol te permite (los tuyos si eres comercial, los de tu zona si eres jefe de zona). Si crees que es un error, pide al Root que revise el `comercial_asignado_id` de ese cliente.

**El tarificador me devuelve "stub" en lugar de precio real.**
La aseguradora aún no tiene API configurada. El Root necesita firmar contrato comercial con Mapfre/Allianz/Axa y meter las credenciales en `Configuración → Integraciones aseguradoras`.

**¿Cómo veo el historial de cambios de un cliente/póliza?**
En la ficha de cualquier registro hay una sección **Historial de auditoría** con los últimos cambios. Solo el Root ve esta sección.

---

Versión del manual: **v1.0 · 2026-05-28**
Sistema: **Correduría OS · Moneta Seguros · v0.9**
