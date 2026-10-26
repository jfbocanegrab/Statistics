# Performance Statistics (NetSF) — contexto del proyecto

Documento para retomar el trabajo en nuevas tareas. La conversación con el equipo es en **español**;
la aplicación (UI, PDF y Excel) es en **inglés**.

## Qué es
Aplicación web que toma uno o varios CSV exportados del gestor (reportes **4G** y **5G**, p. ej.
"5G Performance Report_Query_Result_…(Traffic).csv", "4G Perfomance Report_Query_Result_…Handover.csv")
y genera gráficas por KPI, una tabla comparativa entre dos días y un reporte PDF/Excel con vista previa.

## Stack
- Front: React 18 + Vite + Recharts (`frontend/`), servido por NGINX sin privilegios (puerto 8080).
- Back: Python 3.13 + Flask + pandas + matplotlib + reportlab + openpyxl + pypdfium2, servido por uWSGI (`backend/`).
- Docker (`docker compose up --build` → http://localhost:8080) y Kubernetes con Kustomize para RKE
  Staging/Prod (`k8s/`). Repositorio destino: git.netsf.fr.
- Backend sin estado: cada petición envía los CSV + la configuración.

## Reglas de negocio acordadas
1. **CSV del gestor**: se ignoran líneas de título ("5G Performance Report", "Save Time", "User Name") y el pie
   ("Total N Records"). `NIL`, `N/A`, `-` y vacío = sin dato. Columnas de texto ("Whole Network") se ignoran.
2. **Varios CSV = un solo reporte**: se unen **por fecha**; un KPI repetido en varios archivos se toma una vez
   (gana el primer archivo). No existe agrupación por nodo/columna "Group".
3. **Nombres**: todo KPI empieza con "NetSF " (se agrega si falta). `availability_netsf` → **NetSF AVAILABILITY**.
4. **Orden de KPI** (`backend/app/kpis.py`, por palabras del nombre, aplica a 4G y 5G):
   Traffic → Users → User Throughput (DL, UL) → Availability & Accessibility → Retainability (Drop) →
   Mobility → Other KPIs → Counters (L.xxx / N.xxx). Se muestran por secciones en web, PDF y Excel.
5. **NetSF Integrity** no se grafica (es completitud del reporte); sí puede ir en la tabla.
6. **Líneas de ejecución**: una o varias, modo *Day* (sombrea el día) o *Day & time* (línea en la hora).
7. **Días comparativos**: Day 1 y Day 2 elegidos a mano, independientes del día de ejecución
   (por defecto: último día con datos y 8 días antes). Solo esos dos días llevan etiqueta con el valor del KPI.
8. **Tabla comparativa**: Day 1, Day 2, Difference (= Day 2 − Day 1), Var % (sobre Day 1) y **Status**.
   - Sugerido: |Var %| ≤ 3 % → STABLE (blanco); fuera → IMPROVED (verde) / DEGRADED (rojo) según la
     dirección del KPI ("mayor es peor" si el nombre tiene loss, drop, abnorm, DR, discard, interference,
     BLER, fail, silence, redirect, QPSK…; ver `LOWER_IS_BETTER` en `kpis.py`).
   - El ingeniero puede cambiar Status y el color de Var % (amarillo, verde, rojo, blanco). Al cambiar el
     Status, el color pasa al del nuevo estado.
   - Casillas por KPI y por sección para dejarlos fuera de la tabla del PDF/Excel (independiente de las gráficas).
9. **PDF**: vista previa renderizada en el servidor (página por página) antes de descargar. Excel = tabla comparativa
   con columna Category.
10. **Visual**: paleta NetSF (morado `#5140A8`, violeta `#6F52EF`, tinta `#03071E`, fondo `#F7F6FC`);
    nombre visible "Performance Statistics" (identificador técnico interno: `statgraph`).

## Pendientes / a confirmar antes de RKE
- Registry, hostnames, secret TLS e ingress controller (marcados como placeholder en `k8s/`; ver README).
- Si el nombre "Performance Statistics" queda definitivo, renombrar `statgraph` en Docker/K8s.
- Validar categorías/dirección de KPI con reportes 5G completos (Accessibility, Mobility, NSA).

## Pruebas
`cd backend && pytest -q` (26 pruebas; usan `samples/ejemplo_5g_traffic.csv` y los 8 CSV de `samples/4g/`).
