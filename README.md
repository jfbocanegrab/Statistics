# Performance Statistics (NetSF)

> Nombre visible de la aplicación. Internamente (carpeta, imágenes Docker y recursos de Kubernetes) sigue
> usándose el identificador técnico `statgraph`.

> Interfaz, PDF y Excel en inglés. Esta documentación interna está en español.

Aplicación web que genera **gráficas automáticas** a partir de un CSV de estadísticas, marca una o varias
**líneas de ejecución** (por *día* o *día y hora*), arma una **tabla comparativa contra N días atrás**
(por defecto 8, día completo) y muestra una **vista previa (PRE)** del reporte antes de descargarlo en PDF
(gráficas + tablas) y Excel (tabla comparativa).

## Flujo para el usuario final

1. **Cargar CSV**: uno o varios archivos con el mismo formato (arrastrar y soltar, o *+ Add CSV* para sumar más).
   Siempre es **un solo reporte estadístico**: los archivos (p. ej. Traffic, Throughput, Retainability) se unen
   **por fecha**; un KPI que aparece en varios archivos se toma una sola vez. Las columnas de texto
   (p. ej. "Whole Network") se ignoran. Los avisos de importación están detrás del ícono ⓘ.
2. **Ejecución y días comparativos** (todo manual):
   * **Líneas de ejecución**: una o varias; cada una con nombre, color y tipo **Día** (sombrea el día) o
     **Día y hora** (línea en la hora exacta).
   * **Día comparativo 1 y Día comparativo 2**: dos días completos elegidos a mano, independientes del día de
     ejecución. Se proponen por defecto el último día con datos y 8 días antes.
3. **Revisar**: una gráfica por KPI (todos con prefijo **NetSF**). Solo los dos días comparativos llevan la
   etiqueta con el valor del KPI. Pestaña *Tabla comparativa*: Día 1 vs Día 2, diferencia (Día 2 − Día 1) y
   variación % y **Status**; cálculo del día: promedio, suma, máx., mín. o mediana.
   * Sugerido automáticamente: |Var %| ≤ 3 % → **STABLE** (blanco); fuera de ese rango → **IMPROVED** (verde) o
     **DEGRADED** (rojo) según la dirección del KPI. "Mayor es peor" si el nombre contiene loss, drop, abnorm,
     discard, interference, latency, delay, error, fail, BLER, congest, retrans, jitter o block
     (`backend/app/analysis.py`, `LOWER_IS_BETTER`); el resto, "mayor es mejor".
   * El ingeniero puede cambiar el **Status** (el color de Var % pasa al del nuevo estado) y/o el **color de Var %**
     (amarillo, verde, rojo o blanco). *Reset to suggested* descarta los cambios. Todo se refleja en el PDF y el Excel.
4. **Vista previa y descarga**: el PDF se genera en el servidor y se muestra página por página. Desde ahí se
   descarga el PDF y/o el Excel.

**Orden de los KPI (4G y 5G)** — `backend/app/kpis.py`. Se clasifican por palabras del nombre y se muestran
por secciones en este orden: 1 Traffic · 2 Users · 3 User Throughput (DL, UL) · 4 Availability & Accessibility ·
5 Retainability (Drop) · 6 Mobility · 7 Other KPIs (cell throughput, CQI, PRB/RB, BLER, modulación, VoLTE quality…) ·
8 Counters (L.xxx / N.xxx). Aplica a gráficas, tabla, PDF y Excel (columna *Category*). Para mover un KPI de
categoría se edita la lista de patrones en `CATEGORIES`. `availability_netsf` se muestra como **NetSF AVAILABILITY**.

Cada gráfica tiene un interruptor *In report* para excluirla del PDF, y cada KPI de la tabla comparativa una
casilla para dejarlo fuera de la tabla del PDF/Excel (selecciones independientes). **NetSF Integrity** no se
grafica (es la completitud del reporte, no un KPI de desempeño; `NO_CHART` en `analysis.py`), pero sí puede ir en la tabla. Colores: paleta NetSF
(`backend/app/theme.py` y `frontend/src/styles.css`).

## Formato del CSV

| Requisito | Detalle |
|---|---|
| Fecha/hora | Una columna (`2026-10-22 22:00`, `22/10/2026 22:00`…) **o** `Fecha` + `Hora` separadas |
| Métricas | Cada columna numérica = una gráfica. Admite `12.5`, `12,5`, `1.234,5`, `45%` |
| Separador | `,` `;` tabulación o `|`. Codificación UTF‑8 o Windows‑1252 |
| Reportes exportados | Se ignoran las líneas de título antes de la tabla (`5G Performance Report`, `Save Time`…) y los pies (`Total 30 Records`) |
| Vacíos | `NIL`, `N/A`, `-`, celdas vacías → sin dato (no rompen la métrica) |
| Fechas ambiguas | `dd/mm/aaaa` se interpreta día‑primero; ISO `aaaa-mm-dd` siempre como ISO |

Ejemplos en `samples/` (regenerables con `python samples/generate.py`).

## Arquitectura

```
Navegador ──► Ingress (RKE) ──► NGINX (front React, :8080) ──/api──► uWSGI + Flask (:8000)
```

* **frontend/** — React 18 + Vite + Recharts. NGINX sin privilegios sirve el build y hace proxy de `/api`.
* **backend/** — Python 3.13, Flask, pandas, matplotlib, reportlab, openpyxl, pypdfium2; servido por uWSGI.
* **Sin estado**: cada petición envía el CSV + la configuración, así que se puede escalar a N réplicas sin
  sesiones ni volúmenes compartidos.

| Endpoint | Uso |
|---|---|
| `POST /api/analyze` | Detecta columnas, devuelve series y tablas comparativas |
| `POST /api/report/preview` | PDF (base64) + cada página como PNG para la vista previa |
| `POST /api/report/pdf` | PDF directo (`?download=1` para adjunto) |
| `POST /api/report/xlsx` | Tabla comparativa en Excel |
| `GET /api/health` | Salud del backend |

Todos reciben `multipart/form-data` con `file` y `config` (JSON: `executions`, `compare_days` [día1, día2], `agg`, `metrics`, `title`,
`table_metrics` [KPI de la tabla], `var_colors` {"KPI": "none"|"yellow"|"green"|"red"}, `statuses` {"KPI": "STABLE"|"IMPROVED"|"DEGRADED"}). `file` puede repetirse (varios CSV).

## Desarrollo local

```bash
# Backend
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q
python wsgi.py                      # http://localhost:8000

# Frontend (otra terminal) — /api se envía a :8000
cd frontend && npm ci && npm run dev  # http://localhost:5173
```

Con Docker: `docker compose up --build` → http://localhost:8080

## Despliegue en RKE (Staging / Prod)

```bash
# 1. Construir y publicar imágenes (ajustar REGISTRY al de git.netsf.fr)
REGISTRY=<registry>; TAG=1.0.0
docker build -t $REGISTRY/statgraph/backend:$TAG  backend
docker build -t $REGISTRY/statgraph/frontend:$TAG frontend
docker push $REGISTRY/statgraph/backend:$TAG && docker push $REGISTRY/statgraph/frontend:$TAG

# 2. Revisar y aplicar
kubectl kustomize k8s/overlays/staging | less
kubectl apply -k k8s/overlays/staging
kubectl apply -k k8s/overlays/prod
```

| | Staging | Prod |
|---|---|---|
| Namespace | `statgraph-staging` | `statgraph` |
| Réplicas back/front | 1 / 1 | 2 / 2 + PodDisruptionBudget |
| Host | `statgraph-staging.netsf.fr` ⚠ | `statgraph.netsf.fr` ⚠ |

### ⚠ Verificar antes del primer despliegue

Estos valores **no se han podido confirmar** contra el cluster y están marcados en los manifiestos:

1. **Registry** — `REGISTRY_PLACEHOLDER` en `k8s/overlays/*/kustomization.yaml`.
2. **Hostnames y certificado** — hosts del Ingress y el secret TLS `statgraph-tls` en cada namespace.
3. **Ingress controller** — se asume **ingress-nginx** (`ingressClassName: nginx`) con
   `proxy-body-size: 50m` y `proxy-read-timeout: 120`. Si el cluster usa otro controlador (p. ej. Traefik)
   esas anotaciones se ignoran y hay que configurar el equivalente; si faltan, las subidas > 1 MB fallan
   con 413 en el Ingress.
4. **Límites coherentes** — tamaño máximo: `MAX_UPLOAD_MB` (backend) = `client_max_body_size` (NGINX front)
   = `proxy-body-size` (Ingress). Tiempo máximo: `harakiri` (uWSGI) = `proxy_read_timeout` (NGINX) =
   `proxy-read-timeout` (Ingress). Si se cambia uno, cambiar los tres.

Nada en la configuración depende de una IP: el front encuentra al backend por el DNS del Service
(`http://statgraph-backend:8000`), igual en ambos entornos.

## Verificado

* 26 pruebas `pytest` (incluye los 8 CSV 4G de `samples/4g` y la lista de KPI 5G) (incluye el formato real *5G Performance Report*) (detección de formatos, fechas ISO vs día‑primero, Fecha+Hora separadas, decimales con coma,
  cálculos de la tabla, PDF/Excel/preview, errores).
* Prueba E2E con Playwright a través de NGINX (plantilla real) → uWSGI (`uwsgi.ini` real): carga, dos ejecuciones,
  tabla, vista previa, descarga PDF y Excel, vista móvil, rechazo 413 de archivos > 50 MB.
* `kustomize build` + `kubeconform -strict` (K8s 1.31) sobre ambos overlays.
* **Pendiente**: `docker build` de las imágenes (no se pudo descargar las imágenes base en el entorno de desarrollo).
