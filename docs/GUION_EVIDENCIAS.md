# Guion Paso a Paso de Demostración y Captura de Evidencias (OpsTracker)

Este guion te guía de forma exacta para ejecutar y documentar los **3 Criterios de Aceptación** del proyecto, generando las capturas numeradas (**Figura 1** a **Figura 12**) que se insertarán en [REPORTE_FORMAL.md](./REPORTE_FORMAL.md).

---

## Preparación previa (1 minuto)

1. Verifica que estés en la raíz del proyecto en PowerShell:
   ```powershell
   cd C:\Users\rvang\Documents\Proyect-CI-CD
   git status
   ```
2. Ten abiertas estas 3 pestañas en tu navegador:
   - **GitHub Actions**: `https://github.com/AngelDevHub/Proyect_CI-CD/actions`
   - **App OpsTracker (AWS EC2)**: `http://18.218.32.210`
   - **OpenObserve (AWS EC2)**: `http://18.218.32.210:5080`

---

## PRUEBA 1: Fallo Intencional, Registro de Incidente y Bloqueo de SSH (Criterio de Aceptación 1)

**Objetivo**: Demostrar que si un commit introduce un defecto en un componente visual (o endpoint), Playwright falla, se registra el incidente en OpenObserve (`cicd_logs`) y el job `deploy` se bloquea sin abrir conexión SSH hacia AWS EC2.

### Paso 1.1: Introducir un error intencional en el Frontend
Abre `frontend/src/App.tsx` en la línea 162 y cambia el título de la aplicación:

```tsx
// ANTES (válido):
<h1 className="brand-title" data-testid="app-title">
  OpsTracker
</h1>

// DESPUÉS (fallo intencional que rompe el test E2E de Playwright):
<h1 className="brand-title" data-testid="app-title">
  OpsTracker-Broken-Build
</h1>
```

### Paso 1.2: Hacer commit y push a `main`
```powershell
git add frontend/src/App.tsx
git commit -m "test(ci): fallo intencional en titulo visual para validar bloqueo de SSH"
git push origin main
```

### Paso 1.3: Esperar la ejecución en GitHub Actions (~3-4 min) y tomar capturas
Ve a `https://github.com/AngelDevHub/Proyect_CI-CD/actions` y entra al workflow recién disparado:

- **Figura 3 (Fallo en pruebas Playwright)**:
  - Abre el job `Run Automated Tests (Backend + Playwright)` y expande el paso `Run End-to-End Tests (Playwright)`.
  - Toma captura donde se vea el error en rojo: `Expected string: "OpsTracker" / Received string: "OpsTracker-Broken-Build"`.
- **Figura 4 (Bloqueo del job `deploy` / SSH cerrado)**:
  - Ve a la vista **Summary** del workflow.
  - Toma captura del grafo donde se observe `Run Automated Tests` en **rojo (Failed ❌)** y `Deploy to AWS EC2 via SSH` en **gris (Skipped ⛔)**, demostrando que el despliegue fue bloqueado y nunca se abrió conexión SSH a EC2.
- **Figura 5 (Incidente registrado en OpenObserve)**:
  - Ve a OpenObserve (`http://18.218.32.210:5080`) $\rightarrow$ **Logs** $\rightarrow$ stream `cicd_logs` (rango: *Últimos 30 minutos*).
  - Toma captura del evento JSON con `"event_type": "test_execution"`, `"status": "failure"`, `commit_sha`, `branch: "main"` y `actor`.
  - *(Opcional)* Verifica en `http://18.218.32.210` que el título en producción **sigue diciendo `OpsTracker`** (producción intacta).

---

## PRUEBA 2: Commit Válido, Pruebas en Verde y Auto-Despliegue en EC2 (Criterio de Aceptación 2)

**Objetivo**: Demostrar que al corregir el código, todas las pruebas (Jest + Playwright) pasan, GitHub Actions se conecta por SSH a EC2, actualiza los contenedores y registra el despliegue en OpenObserve.

### Paso 2.1: Revertir / corregir el cambio en `frontend/src/App.tsx`
Restaura el título original en `frontend/src/App.tsx` (línea 162):

```tsx
<h1 className="brand-title" data-testid="app-title">
  OpsTracker
</h1>
```

### Paso 2.2: Hacer commit y push a `main`
```powershell
git add frontend/src/App.tsx
git commit -m "fix(ui): restaurar titulo valido OpsTracker para despliegue automatico"
git push origin main
```

### Paso 2.3: Esperar la ejecución en GitHub Actions y tomar capturas
- **Figura 6 (Pipeline completo en verde)**:
  - En **Summary** del workflow en GitHub Actions, toma captura donde tanto `Run Automated Tests (Backend + Playwright)` como `Deploy to AWS EC2 via SSH` aparezcan en **verde (Success ✅)**.
- **Figura 7 (Logs del despliegue por SSH en AWS EC2)**:
  - Entra al job `Deploy to AWS EC2 via SSH` $\rightarrow$ expande `Deploy containers on AWS EC2`.
  - Toma captura mostrando la actualización por SSH (`git reset --hard origin/main`, `docker compose -f docker-compose.prod.yml up -d --build` y `docker compose ps` con los 5 contenedores `Up`/`healthy`).
- **Figura 8 (Eventos de prueba exitosa y despliegue en OpenObserve)**:
  - En OpenObserve $\rightarrow$ **Logs** $\rightarrow$ stream `cicd_logs`, toma captura mostrando los dos registros consecutivos del mismo commit:
    1. `event_type: "test_execution"`, `status: "success"`.
    2. `event_type: "deployment"`, `status: "success"`, `target_host: "18.218.32.210"`.

---

## PRUEBA 3: Generación de Tráfico y Observabilidad Integral en OpenObserve (Criterio de Aceptación 3)

**Objetivo**: Generar tráfico real sobre los endpoints de OpsTracker en AWS EC2 y capturar la observabilidad unificada en OpenObserve (logs de CI/CD, logs estructurados con `trace_id`, trazas HTTP + PostgreSQL, métricas de aplicación, gráficas de infraestructura EC2 y alertas operativas).

### Paso 3.1: Generar tráfico controlado hacia la app en AWS EC2
Ejecuta este bloque en PowerShell desde tu computadora para generar peticiones `GET`, `POST`, `PATCH`, `DELETE` y 3 errores controlados `500` (que además dispararán la alerta `opstracker_http_5xx_errors`):

```powershell
$base = "http://18.218.32.210"

# 1. Consultas de salud y listado
1..5 | ForEach-Object {
  Invoke-RestMethod "$base/api/health" | Out-Null
  Invoke-RestMethod "$base/api/tasks" | Out-Null
}

# 2. Ciclo completo CRUD (genera spans HTTP + PostgreSQL INSERT, SELECT, UPDATE, DELETE)
$t = Invoke-RestMethod -Method Post -Uri "$base/api/tasks" -ContentType "application/json" -Body '{"title":"Validacion Final Fase 6","description":"Generando trazas OTLP en AWS EC2","priority":"high"}'
Invoke-RestMethod -Method Patch -Uri "$base/api/tasks/$($t.id)" -ContentType "application/json" -Body '{"status":"in_progress"}' | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/api/tasks/$($t.id)" | Out-Null

# 3. Disparar 4 errores controlados 500 (registra excepciones con trace_id y dispara alerta 5xx)
1..4 | ForEach-Object {
  try { Invoke-RestMethod "$base/api/error-test" } catch { Write-Host "Error 500 simulado #$_ registrado" }
}

Write-Host "Trafico de observabilidad generado correctamente."
```

*(Espera ~15 segundos para que el exportador OTLP haga flush de métricas y logs hacia OpenObserve).*

### Paso 3.2: Tomar las capturas de Observabilidad en OpenObserve (`http://18.218.32.210:5080`)

- **Figura 1 (Interfaz web de OpsTracker en AWS EC2)**:
  - Abre `http://18.218.32.210`, crea una tarea visible en pantalla y toma captura mostrando la píldora verde `API: Online · DB: connected`, las tarjetas de métricas y la lista de tareas.
- **Figura 2 (Ejecución local de pruebas Jest + Playwright)**:
  - Toma captura de tu terminal ejecutando `npm run test:all` (o los logs de Jest/Playwright en GitHub Actions) mostrando `15 passed` en Jest y `5 passed` en Playwright.
- **Figura 9 (Logs estructurados de la aplicación con `trace_id`)**:
  - En OpenObserve $\rightarrow$ **Logs** $\rightarrow$ stream `opstracker_logs`.
  - Toma captura donde se aprecien las columnas/campos `timestamp`, `severity` (`INFO`/`ERROR`), `endpoint`, `statuscode` (`200`, `201`, `500`), `duration_ms` y `trace_id`.
- **Figura 10 (Traza distribuida individual: HTTP + PostgreSQL)**:
  - En OpenObserve $\rightarrow$ **Trazas** (*Traces*) $\rightarrow$ haz clic sobre una traza de `POST /api/tasks` o `GET /api/tasks`.
  - Toma captura del detalle de cascada (*waterfall*) donde se vean simultáneamente el span padre HTTP de Fastify y el span hijo de consulta a PostgreSQL (`pg.query` / `INSERT` o `SELECT`).
- **Figura 11 (Tablero Unificado — Dashboard en OpenObserve)**:
  - En OpenObserve $\rightarrow$ **Dashboards** $\rightarrow$ abre `OpsTracker — Unified Operations & Observability` (rango: *Últimas 24 horas* o *Última 1 hora*).
  - Toma 1 o 2 capturas claras donde se visualicen los paneles de:
    - Historial y tasa de éxito de **CI/CD** (`cicd_logs`).
    - Logs, códigos HTTP y latencia por endpoint (`opstracker_logs`).
    - Gráficas de **CPU (%)**, **Memoria RAM (%)**, **Ancho de Banda (TX/RX kbps)** y **Temperatura (°C)** de AWS EC2 (`ec2_metrics`).
- **Figura 12 (Alertas Operativas en OpenObserve)**:
  - En OpenObserve $\rightarrow$ **Confiabilidad / Alertas**.
  - Toma captura de la tabla con las 3 alertas activas (`opstracker_cicd_failure`, `opstracker_ec2_high_cpu`, `opstracker_http_5xx_errors`) y, tras esperar el ciclo de evaluación de 5 minutos después del script del Paso 3.1, captura el historial de `opstracker_http_5xx_errors` o `opstracker_cicd_failure` mostrando el estado **`En disparo` / `Crítico`**.

---

## Checklist rápido antes de entregar el documento

- [ ] Todas las figuras (Figura 1 a Figura 12) están insertadas, nítidas y con su pie de figura debajo.
- [ ] El texto de Introducción, Desarrollo y Conclusiones está en formato **justificado**.
- [ ] Los enlaces del repositorio GitHub, app en EC2 y OpenObserve abren correctamente en una ventana de incógnito.
- [ ] Ninguna llave privada (`.pem`) ni secreto sensible de AWS fue incluido en el documento ni en el repositorio público.
