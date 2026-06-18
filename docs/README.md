# Documentación · Correduría OS (Moneta Seguros)

Índice de todos los documentos del proyecto. Empieza por el que más te interese según tu rol.

---

## Si eres un usuario nuevo del sistema

👉 **[MANUAL_USUARIO.md](MANUAL_USUARIO.md)** · Manual paso a paso para los 4 roles (root, jefe de zona, comercial, secretaria). Cómo entrar, qué hacer en cada pantalla, flujos típicos (crear cliente, alta de póliza, aprobar comisión, enviar campaña), FAQ.

---

## Si quieres entender qué hace cada parte del SaaS

👉 **[GLOSARIO_FUNCIONAL.md](GLOSARIO_FUNCIONAL.md)** · Cada ruta del menú, cada módulo: qué es, qué hace, para qué sirve, quién la usa, qué genera. Cubre 21+ rutas + conceptos técnicos (RLS, SSR, PWA, audit log, Edge Functions).

---

## Si eres desarrollador/a que se incorpora al proyecto

👉 **[GLOSARIO_BASE_DATOS.md](GLOSARIO_BASE_DATOS.md)** · Cada tabla, vista, función, trigger y RLS del schema PostgreSQL. ~30 tablas documentadas con columnas, FK, índices, RLS y triggers. Incluye diagrama lógico textual.

👉 **[GUIA_DISENO_SAAS.md](GUIA_DISENO_SAAS.md)** · Decisiones de diseño UI: paleta de colores, tipografía, componentes shadcn/ui usados, espaciado.

---

## Para auditoría / compliance

👉 **[AUDITORIA_MATRIZ_DIEGO.md](AUDITORIA_MATRIZ_DIEGO.md)** · Cumplimiento item por item contra la matriz original de Diego Moneta. Útil para presentarle el estado.

👉 **[ESTADO_FINAL.md](ESTADO_FINAL.md)** · Snapshot completo del proyecto con modelo de datos, rutas, comandos clave, matriz de roles consolidada.

---

## Para histórico y trazabilidad

👉 **[CHANGELOG.md](CHANGELOG.md)** · Histórico de versiones v0.1 → v0.10 con qué cambió en cada una.

👉 **[BITACORA_TRABAJO.md](BITACORA_TRABAJO.md)** · Narrativa cronológica del desarrollo. 6 fases identificadas.

👉 **[BUG_CONTEXTO_PARA_OTRO_MODELO.md](BUG_CONTEXTO_PARA_OTRO_MODELO.md)** · Contexto del bug de navegación que tardó 2 días en diagnosticarse (faltaba `<Outlet />` en `configuracion.tsx`). Ya resuelto, se mantiene como referencia histórica.

---

## Si vas a hacer un deploy desde cero a otro cliente

👉 **[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)** · Guía completa de deploy en Railway, paso a paso. Variables de entorno, problemas conocidos (Node 22 + WebSocket), alternativas de hosting (Render, Fly.io, VPS), coste estimado. Probada y verificada el 2026-06-08.

**Resumen rápido del stack que necesita el cliente final**:

- Cuenta en **Supabase** (BD + Auth + Storage + Edge Functions) · Free hasta 50k MAU
- Cuenta en **Cloudflare** (Workers para hosting SSR) · Free hasta 100k req/día
- Cuenta en **Resend** (emails transaccionales y campañas) · Free 3000 emails/mes
- API key de **Google Gemini** (extracción IA de PDFs de pólizas) · Free generoso
- **GitHub** para alojar el código

**Coste real para 1 cliente piloto**: 0€/mes en free tier. ~30€/mes si crece (Cloudflare Workers Paid + Resend Pro).

---

## Archivos Word (resumen ejecutivo)

- `Avances proyecto.docx` · Resumen del proyecto en formato presentable
- `actualización proyecto monetav2.docx` · Actualización v2 con últimas features

---

## URLs canónicas

- **Producción**: <https://tanstack-start-app.makeflowia.workers.dev>
- **Repo principal**: <https://github.com/makeflowia-lab/moneta-unified-hub>
- **Repo espejo**: <https://github.com/ricardo-multiatlas/moneta>

---

## Tag de respaldo recomendado para volver atrás

```bash
git checkout monetav2-2026-05-28-2004
```

Te lleva al estado estable previo a la migración EU + v0.10. Para retomar:

```bash
git checkout main
git pull
```

---

Última actualización: **2026-05-28**
Versión del sistema: **v0.10** · Worker `0bcd2462-94ea-44e8-9f29-349137eb7ba5`
