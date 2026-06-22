# Pendiente · Transferencia del repo a Multiatlas-SL

Documento de seguimiento de la acción pausada el **2026-06-22**.

## TL;DR

El código de Moneta vive hoy en `https://github.com/ricardo-multiatlas/moneta` (cuenta personal del compañero). Se decidió moverlo a la organización Multiatlas-SL como `https://github.com/Multiatlas-SL/moneta`. La transferencia la tiene que iniciar Ricardo (dueño actual) desde GitHub web. **Se pausó porque no había acceso al Gmail necesario para completar el 2FA**.

## Estado de los respaldos (todos vivos)

| Respaldo | Dónde | Cómo restaurar |
|---|---|---|
| Tag git `backup-pre-transfer-2026-06-22` | En `ricardo-multiatlas/moneta` | `git checkout backup-pre-transfer-2026-06-22` |
| Branch `backup/v0.11-pre-org-2026-06-22` | En `ricardo-multiatlas/moneta` | `git checkout backup/v0.11-pre-org-2026-06-22` |
| Copia local entera | `d:\proyectos sr. ruben\moneta\BACKUP-2026-06-22\` (7.5 MB) | Copiar la carpeta de vuelta. Tiene `.git`, `.env`, código, docs, migraciones. Sin `node_modules`. |

Último commit respaldado: **`ee45bea`** (PDF estado v0.11).

## Instrucciones para Ricardo (las mismas que ya se le pasaron)

1. Abre `https://github.com/ricardo-multiatlas/moneta/settings`
2. Baja del todo hasta **"Danger Zone"**
3. Botón **"Transfer ownership"**
4. En el formulario:
   - **New owner** → `Multiatlas-SL`
   - **Confirmation** → escribe `ricardo-multiatlas/moneta`
5. Click **"I understand, transfer this repository"**
6. Confirma con tu 2FA / contraseña

Tarda 1 minuto. Conserva todo (commits, branches, tags, colaboradores). GitHub deja redirect 6+ meses desde la URL vieja.

## Cuando Ricardo confirme que lo hizo

Pasos para cerrar (los ejecuto yo o el siguiente desarrollador):

1. Verificar que el repo aparece en `https://github.com/Multiatlas-SL/moneta`:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: token $GITHUB_PAT" \
     https://api.github.com/repos/Multiatlas-SL/moneta
   # Debe devolver 200
   ```

2. Actualizar el remote local:
   ```bash
   cd "d:/proyectos sr. ruben/moneta/moneta-unified-hub"
   git remote set-url --push origin "https://ricardo-multiatlas:$GITHUB_PAT@github.com/Multiatlas-SL/moneta.git"
   ```

3. Verificar push:
   ```bash
   git push origin main          # debe decir "Everything up-to-date"
   git push origin --tags        # subir tags al nuevo destino
   ```

4. Actualizar referencias a la URL en docs:
   - `docs/SOBERANIA_DATOS.md`
   - `docs/ESTADO_v11_MONETA.html` / `.pdf`
   - `docs/README.md`
   - `docs/COMUNICACION_RUBEN_2026-06-20.md`
   - `docs/DEPLOY_RAILWAY.md`

5. Commit `chore: completar transferencia del repo a Multiatlas-SL` y push.

## Si Ricardo no responde o no puede

Plan B documentado: crear `Multiatlas-SL/moneta` nuevo desde mi PAT, hacer push del estado actual allí. Pierde issues/PRs/releases históricos pero conserva commits y código. Como hoy no hay issues ni PRs abiertos en el repo original, la pérdida es irrelevante. Decisión del usuario.

## Tarea menor relacionada (también pendiente)

En la org Multiatlas-SL quedó un repo de prueba creado por error: `Multiatlas-SL/_test_dryrun_borrar` (público, vacío). Mi PAT no puede borrarlo (HTTP 403). Cuando Ricardo o un admin de la org esté dentro, puede borrarlo desde:
`https://github.com/Multiatlas-SL/_test_dryrun_borrar/settings` → Danger Zone → Delete

---

Última actualización: **2026-06-22**
Commit de pausa: `ee45bea`
