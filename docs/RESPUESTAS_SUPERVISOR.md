# Respuestas para el supervisor

Documento pensado para personas no técnicas (dirección, supervisores, gerentes). Lenguaje llano, sin jerga.

---

## 1. ¿Quién decide que Diego es el "root" del sistema?

Hay **dos niveles de jefe** en el sistema. No es uno solo.

### Nivel 1 — Nosotros somos los dueños del edificio

Como proveedores hemos contratado el espacio donde vive Moneta (los servicios de Supabase, Cloudflare y demás). La factura mensual está a nombre de MultiAtlas. Si mañana queremos apagar todo, podemos. Diego nunca tendrá acceso a esto y no debe tenerlo. Es como el casero del local: el inquilino vive ahí, pero las llaves maestras las tiene el propietario.

### Nivel 2 — Diego es el dueño del negocio dentro del edificio

Dentro de la aplicación Moneta, Diego tiene el rol "root" porque cuando le dimos de alta marcamos su ficha así. Eso le da **control total dentro de la aplicación**: puede dar de alta empleados, modificar comisiones, ver auditorías, configurar todo. Es como el dueño de la correduría dentro de su oficina: manda él, no nosotros.

### ¿Puede Diego tener un segundo de a bordo?

**Sí, sin ningún problema.** Cuando él entre a "Configuración → Usuarios y equipo", puede crear cualquier otro usuario con el mismo nivel "root" — por ejemplo su socio, su director financiero, su mano derecha. El sistema permite tener **varios "root" a la vez sin pisarse**.

Hoy ya hay 3 personas con ese nivel funcionando simultáneamente sin conflictos:

- Rubén Toledano (MultiAtlas)
- MakeFlowIA (cuenta administradora)
- Ingeniero Ricardos (cuenta de soporte)

### Conclusión

Hay un root "técnico" (nosotros, que mantenemos la plataforma para todos los clientes) y uno o varios root "de negocio" (Diego y a quienes él elija). Son cosas distintas y los dos pueden convivir sin pisarse.

Diego puede crear cuantos root quiera por debajo de él, y también roles intermedios (jefe de zona, comercial, secretaria) que ven solo la parte que él decida.

### Diagrama visual de la jerarquía

```text
╔══════════════════════════════════════════════════════════════╗
║  NIVEL PROVEEDOR · MultiAtlas (NOSOTROS)                     ║
║  ─────────────────────────────────────                       ║
║  • Owner de Supabase, Cloudflare, Resend                     ║
║  • Recibe las facturas                                       ║
║  • Puede regenerar contraseñas a nivel infraestructura       ║
║  • Acceso de emergencia para soporte técnico                 ║
║                                                              ║
║  Cuentas: makeflowia@gmail.com · rubentoledano@multiatlas.net║
╚══════════════════════════════════════════════════════════════╝
                              │
                              │  monta y entrega
                              ▼
╔══════════════════════════════════════════════════════════════╗
║  NIVEL APLICACIÓN · Correduría Moneta (CLIENTE)              ║
║                                                              ║
║      ┌────────────────────────────────────────┐              ║
║      │  ROOT principal · Diego Moneta         │              ║
║      │  Dueño del negocio dentro de la app    │              ║
║      │  Configura todo, ve todo, decide todo  │              ║
║      └────────────────────────────────────────┘              ║
║                       │                                      ║
║           ┌───────────┼────────────┬─────────────┐           ║
║           ▼           ▼            ▼             ▼           ║
║      ┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐     ║
║      │ ROOT 2 │  │  Jefe   │  │  Jefe    │  │Secretaria│     ║
║      │ Socio  │  │ Zona A  │  │ Zona B   │  │   Ana    │     ║
║      │ Diego  │  │  Luis   │  │  María   │  │          │     ║
║      └────────┘  └────┬────┘  └────┬─────┘  └──────────┘     ║
║      (opcional)       │            │              ▲          ║
║                       ▼            ▼              │          ║
║                  ┌─────────┐  ┌─────────┐   Ve todos los     ║
║                  │Comerciales│  │Comerciales│   clientes     ║
║                  │ Zona A  │  │ Zona B  │   pero no las     ║
║                  │ (Juan,  │  │ (Sara,  │   comisiones      ║
║                  │  Pedro) │  │  Luis)  │                   ║
║                  └─────────┘  └─────────┘                   ║
║                                                              ║
║   Cada persona solo ve lo que su rol permite (RLS)           ║
╚══════════════════════════════════════════════════════════════╝
```

**Cómo leer el diagrama**:

1. **Caja de arriba (NIVEL PROVEEDOR)**: somos nosotros. No salimos en la app. Vivimos en los paneles de Supabase y Cloudflare. Diego no nos ve.
2. **Caja de abajo (NIVEL APLICACIÓN)**: lo que Diego ve y gestiona. Él manda dentro de esta caja.
3. Diego puede crear todos los root y empleados que necesite. Cuando un jefe de zona entra, **solo ve a su equipo y sus clientes**. Cuando un comercial entra, **solo ve sus propios clientes**.
4. La secretaria es un caso especial: ve a todos los clientes (para soporte telefónico) pero **no ve datos financieros** como las comisiones.

---

## 2. ¿Esto se puede mover a otro servidor en el futuro?

**Sí, sin problema.** Pero primero una aclaración.

### Aclaración previa

La dirección `socialflow-web.onrender.com` que mencionó el supervisor pertenece a **otro proyecto distinto**, no a Moneta. Moneta vive en `tanstack-start-app.makeflowia.workers.dev`, que está alojado en el servicio Cloudflare, no en Render. Son cosas diferentes.

### ¿Y la app de Moneta se puede cambiar de servidor si hace falta?

**Sí.** Imagina la aplicación como una caja. Hoy esa caja está apoyada en una "estantería" de Cloudflare (rápida, barata, llega a usuarios de todo el mundo). Si mañana queremos moverla a otra estantería (un servidor propio en España tipo VPS, un servicio como Render, Vercel, o donde sea), **la caja no cambia por dentro**. Solo cambia dónde se apoya.

### ¿Qué supone moverlo?

- Aproximadamente **una tarde de trabajo** nuestro
- **Sin perder datos** (los datos viven en otro sitio aparte, en Supabase)
- **Sin rehacer nada de la aplicación** (el programa es el mismo)
- **Sin que Diego ni los comerciales noten nada** (mismo navegador, misma URL si así se decide)

### ¿Cuándo tendría sentido moverlo?

Solo si:

1. Un cliente concreto en el futuro nos dice "yo quiero la app en MI servidor para mi tranquilidad" (es típico en banca y seguros grandes)
2. Cloudflare nos diera algún problema serio (muy improbable, es un proveedor de primer nivel)
3. Por cumplimiento legal de algún cliente específico

Para Moneta, **hoy no hay razón para moverlo**. Cloudflare es más rápido, más barato y más fiable que casi cualquier alternativa.

### Opciones donde puede vivir Moneta sin tocar el código

- **Cloudflare Workers** — donde está ahora. Gratis hasta cierto uso, después unos 5 € al mes
- **Vercel** — alternativa popular, parecida en precio
- **Render** — más cara y más lenta para esta clase de aplicación
- **Railway** — pago por uso real, transparente
- **Servidor propio** (VPS en Hetzner, DigitalOcean, etc.) — desde 4-15 € al mes, más control

### Lo importante

El código de Moneta **no está atado a Cloudflare**. Cambiar de hosting si hace falta es una decisión que se toma en horas, no en días, y sin reescribir la aplicación. Para vuestra tranquilidad: nada en este proyecto os deja "encerrados" con un proveedor concreto.

---

## Tabla resumen para presentar

| Pregunta                                            | Respuesta corta                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ¿Quién hace root a Diego?                           | Lo marcamos nosotros al crear su cuenta. Diego no se lo asigna solo                                            |
| ¿Puede haber más roots?                             | Sí, todos los que Diego decida. Hoy ya conviven 3 en producción                                                |
| ¿Diego puede dar de alta a su socio como root?      | Sí, desde su panel de Configuración                                                                            |
| ¿Nosotros perdemos el control si Diego tiene root?  | No. Nosotros somos dueños de la plataforma (Supabase, Cloudflare). Él es dueño del uso. Son cosas separadas    |
| ¿Hoy dónde vive la aplicación?                      | En Cloudflare (no en Render)                                                                                   |
| ¿Se puede mover a otro sitio?                       | Sí, una tarde de trabajo, sin perder datos, sin rehacer nada                                                   |
| ¿Cuánto cuesta hoy? | Gratis hasta cierto uso. Si crece, unos 30 € al mes |
| ¿Estamos atados a Cloudflare? | No. Es portable a Vercel, Render, VPS propio, lo que el cliente prefiera |

---

Fecha del documento: **2026-05-28**
Para: dirección y supervisión de MultiAtlas
Sistema: **Correduría OS · Moneta Seguros**
