<!-- ==========================================================================
     INSTRUCCIONES DE FORMATO PARA WORD / GOOGLE DOCS / PDF:
     1. Aplica formato de TEXTO JUSTIFICADO a todos los párrafos de Introducción,
        Desarrollo Técnico y Conclusiones.
     2. Completa los campos entre corchetes [ ... ] de la Portada Institucional.
     3. Inserta tus capturas de pantalla en cada espacio marcado como
        [INSERTAR CAPTURA AQUÍ] siguiendo el guion en docs/GUION_EVIDENCIAS.md.
     ========================================================================== -->

# PORTADA INSTITUCIONAL

<div align="center">

**[NOMBRE COMPLETO DE LA UNIVERSIDAD / INSTITUCIÓN]**  
**[FACULTAD / DIVISIÓN ACADÉMICA]**  
**[NOMBRE DE LA CARRERA / PROGRAMA EDUCATIVO]**

<br>

**Asignatura:** [Nombre de la materia, ej. DevOps / Ingeniería de Software / Cómputo en la Nube]  
**Docente:** [Nombre completo del profesor(a)]

<br>

## IMPLEMENTACIÓN DE UN PIPELINE CI/CD CONDICIONADO A PRUEBAS AUTOMATIZADAS HACIA AWS EC2 CON OBSERVABILIDAD CENTRALIZADA EN OPENOBSERVE (PROYECTO OPSTRACKER)

<br>

**Presentado por:**  
[Nombre completo del alumno 1 — Matrícula]  
[Nombre completo del alumno 2 — Matrícula *(eliminar si es individual)*]

<br>

**Lugar y Fecha:** [Ciudad, Estado], a [Día] de [Mes] de [Año]

</div>

---

## 1. Introducción

*(Aplicar formato de texto justificado)*

En la ingeniería de software moderna, la capacidad de entregar cambios a producción de manera frecuente, confiable y auditable depende directamente de la integración entre las prácticas de Integración Continua y Despliegue Continuo (CI/CD), la automatización de pruebas y la observabilidad de extremo a extremo. Desplegar aplicaciones manualmente hacia servidores en la nube introduce riesgos operativos elevados, como regresiones funcionales, errores de configuración, tiempos de inactividad no planificados y ausencia de trazabilidad ante incidentes.

El presente proyecto implementa una arquitectura DevOps y de Ingeniería de Confiabilidad del Sitio (SRE) completa alrededor de la aplicación web **OpsTracker**, un tablero operativo de gestión de tareas e incidentes desarrollado con React, Vite, TypeScript, Fastify y PostgreSQL contenerizado con Docker. La solución automatiza la validación de cada cambio mediante una compuerta estricta de calidad (*Quality Gate*) en GitHub Actions compuesta por pruebas de integración de backend con Jest y pruebas de extremo a extremo (*End-to-End*) con Playwright. Solo cuando la totalidad de las pruebas resulta exitosa se autoriza la conexión SSH hacia la instancia de Amazon Web Services (AWS) EC2 para actualizar los contenedores en producción; ante cualquier fallo, el despliegue se bloquea automáticamente y se registra el incidente.

De manera paralela, el ecosistema centraliza los tres pilares de la observabilidad —logs, métricas y trazas distribuidas— en una instancia dedicada de **OpenObserve**. Mediante instrumentación con el estándar abierto **OpenTelemetry (OTLP/HTTP)** en el backend, eventos HTTP JSON enviados directamente desde el pipeline CI/CD y un recolector continuo de telemetría de infraestructura del servidor EC2 (CPU, memoria RAM, ancho de banda de red y temperatura), se logra visibilidad unificada en tiempo real acompañada de un tablero consolidado y reglas de alerta operativa.

---

## 2. Objetivo General

Diseñar, implementar y validar un pipeline CI/CD automatizado en GitHub Actions hacia una instancia AWS EC2 condicionado al cumplimiento de pruebas integrales de backend y E2E con Playwright, integrando observabilidad centralizada en OpenObserve para el monitoreo simultáneo de eventos del pipeline, telemetría aplicativa vía OpenTelemetry (logs, métricas y trazas) y métricas de infraestructura del servidor (CPU, RAM, ancho de banda y temperatura), junto con alertas operativas.

---

## 3. Desarrollo Técnico

*(Aplicar formato de texto justificado en cada sección)*

### 3.1 Arquitectura de la Aplicación OpsTracker

La aplicación **OpsTracker** fue estructurada bajo una arquitectura desacoplada y contenerizada mediante Docker y Docker Compose (`docker-compose.yml` para desarrollo local y `docker-compose.prod.yml` para producción en AWS EC2):

- **Frontend (`React + Vite + TypeScript + Nginx`)**: Interfaz operativa en modo oscuro que integra módulo completo de **Autenticación (Login, Register y cierre de sesión con persistencia JWT)**, pestaña de **Gestión de Usuarios (CRUD Users)** y tablero de **Tareas Operativas**, además del indicador de salud del sistema (`GET /api/health`) y botón de simulación de error (`GET /api/error-test`). Todos los controles interactivos incorporan atributos `data-testid` deterministas para pruebas automatizadas. En producción, Nginx sirve el paquete compilado en el puerto `80` y actúa como proxy inverso redirigiendo `/api/` hacia el contenedor del backend.
- **Backend (`Node.js 22 + TypeScript + Fastify 5`)**: API REST modular que expone autenticación con contraseñas cifradas (`crypto.scryptSync`) y tokens JWT firmados (`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`), CRUD completo de usuarios protegido por Bearer token (`GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`), gestión de tareas (`GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`), salud (`GET /api/health`) y prueba controlada de excepción (`GET /api/error-test`). Se conecta mediante un pool de conexiones a **PostgreSQL 16** (`postgres:16-alpine`), inicializando automáticamente las tablas `users` y `tasks` junto con el usuario administrador de evaluación (`admin@opstracker.com`).

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 1.** Interfaz web de la aplicación OpsTracker operando en producción sobre AWS EC2 (`http://18.218.32.210`), mostrando el indicador de conectividad con API y PostgreSQL, métricas de tareas y gestión operativa.

---

### 3.2 RF-01: Pruebas Integrales Automatizadas (Backend con Jest y E2E con Playwright)

Para garantizar la integridad funcional antes de cualquier despliegue, se implementaron dos niveles complementarios de pruebas automatizadas orquestados desde el `package.json` raíz (`npm run test:all`):

1. **Pruebas de Integración de Backend (`Jest + ts-jest`)**: Ubicadas en `backend/src/__tests__/tasks.test.ts` y `backend/src/__tests__/auth-users.test.ts`, ejecutan **20 casos de prueba** contra la instancia real de Fastify y PostgreSQL validando:
   - Registro de usuarios (`POST /api/auth/register`), prevención de correos duplicados (`409`), inicio de sesión (`POST /api/auth/login`), validación de sesión (`GET /api/auth/me`) y rechazo de accesos sin token (`401`).
   - Ciclo de vida completo CRUD de usuarios (`/api/users` y `/api/users/:id`: crear, listar, actualizar nombre/rol y eliminar).
   - Disponibilidad y conectividad de base de datos en `GET /api/health`.
   - Ciclo completo CRUD de tareas (`/api/tasks` y `/api/tasks/:id`) con validaciones y códigos de estado `200`, `201`, `400` y `404`.
   - Respuesta controlada de excepción HTTP `500` con identificador de traza en `GET /api/error-test`.
2. **Pruebas End-to-End (`Playwright`)**: Configuradas en `playwright.config.ts` e implementadas en `e2e/opstracker.spec.ts`, ejecutan **5 flujos completos** en Chromium headless contra la aplicación real (Frontend + Nginx + Backend + PostgreSQL): registro de nuevo usuario $\rightarrow$ cierre de sesión $\rightarrow$ inicio de sesión (Login), ciclo completo CRUD de Usuarios (crear, persistir tras `page.reload()`, editar y eliminar), carga del tablero de tareas, ciclo CRUD completo de tareas con filtros y despliegue del banner ante errores HTTP `500`.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 2.** Ejecución exitosa de la suite integral de pruebas (`npm run test:all`), evidenciando 20 pruebas aprobadas en Jest (Auth, CRUD Users y Tasks) y 5 flujos aprobados en Playwright (E2E).

---

### 3.3 RF-02 y RF-03: Pipeline CI/CD en GitHub Actions con Compuerta SSH y Reporte a OpenObserve

El flujo de entrega continua fue implementado en `.github/workflows/ci-cd.yml` con dos jobs estrictamente dependientes:

- **Job `test` (Compuerta de Calidad)**: En cada `push` o `pull_request` hacia `main`, el runner de GitHub Actions levanta los contenedores de prueba (`postgres`, `backend` y `frontend`), espera a que el healthcheck del backend reporte estado `healthy`, instala Chromium de Playwright y ejecuta secuencialmente `npm run test:backend` y `npm run test:e2e`. Ante un fallo, almacena el reporte HTML de Playwright como artefacto descargable.
- **Reporte de eventos CI/CD a OpenObserve (`RF-03`)**: Mediante un paso configurado con `if: always()`, el pipeline construye un documento JSON estructurado con `jq` (`event_type`, `status`, `commit_sha`, `commit_message`, `branch`, `actor`, `workflow`, `run_id`, `run_number`, `repository`, `timestamp`) y lo envía por HTTP POST autenticado con Basic Auth al endpoint `/api/default/cicd_logs/_json` de OpenObserve.
- **Job `deploy` (`needs: test`, `if: success() && github.ref == 'refs/heads/main'`)**: Si alguna prueba de Jest o Playwright falla, este job es omitido automáticamente (*Skipped*), bloqueando por completo cualquier intento de conexión SSH hacia AWS EC2. Únicamente cuando `test` concluye en verde, utiliza `appleboy/ssh-action@v1.2.0` con los secretos configurados en GitHub (`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`) para conectarse al servidor, sincronizar el código (`git reset --hard origin/main`), reconstruir los contenedores con `docker compose -f docker-compose.prod.yml up -d --build` y emitir el evento `event_type: "deployment"` a OpenObserve.

#### Validación del Criterio de Aceptación 1 (Fallo Intencional y Bloqueo SSH)

Se introdujo un defecto intencional en el encabezado visual de `frontend/src/App.tsx`, provocando el fallo inmediato de las aserciones de Playwright en GitHub Actions, el registro del incidente en OpenObserve y el bloqueo total del despliegue SSH.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 3.** Fallo detectado por Playwright en el job `test` de GitHub Actions ante el cambio intencional en el componente visual de `OpsTracker`.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 4.** Bloqueo automático del job `Deploy to AWS EC2 via SSH` (estado *Skipped*), confirmando que no se estableció conexión SSH con la instancia EC2 tras el fallo en pruebas.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 5.** Registro del incidente de prueba (`status: "failure"`, `commit_sha`, `branch`, `actor`) recibido vía HTTP POST JSON en el stream `cicd_logs` de OpenObserve.

#### Validación del Criterio de Aceptación 2 (Commit Válido y Despliegue Automático)

Tras corregir el componente visual y realizar `git push` a la rama `main`, la suite completa de pruebas aprobó exitosamente, habilitando la conexión SSH y la actualización automática de los contenedores en AWS EC2.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 6.** Ejecución exitosa del pipeline completo en GitHub Actions mostrando los jobs `Run Automated Tests` y `Deploy to AWS EC2 via SSH` en verde.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 7.** Detalle de la ejecución SSH sobre la instancia AWS EC2 actualizando el repositorio y reconstruyendo los contenedores productivos con Docker Compose.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 8.** Confirmación en el stream `cicd_logs` de OpenObserve de los eventos consecutivos `test_execution` (`success`) y `deployment` (`success`) hacia el host `18.218.32.210`.

---

### 3.4 RF-04: Instrumentación de la Aplicación con OpenTelemetry (OTLP/HTTP)

El backend de OpsTracker fue instrumentado desde el arranque (`backend/src/telemetry.ts`, importado antes de Fastify y `pg` en `backend/src/server.ts`) utilizando `@opentelemetry/sdk-node` y exportadores **OTLP/HTTP** hacia OpenObserve (`/v1/traces`, `/v1/metrics` y `/v1/logs`):

- **Logs Estructurados (`backend/src/logger.ts`)**: Cada operación HTTP, operación CRUD y excepción no controlada se emite simultáneamente a `stdout` y al API de logs de OpenTelemetry, incluyendo `timestamp`, `severity`, `operation`, `endpoint`, `method`, `statuscode`, `duration_ms`, `trace_id`, `span_id` y trazas de pila (`exception_type`, `exception_message`, `exception_stacktrace`) en caso de error. Además, cada respuesta HTTP incluye la cabecera `x-trace-id` para correlación directa.
- **Métricas de Aplicación (`backend/src/metrics.ts`)**: Mediante el Meter de OpenTelemetry se exportan cada 10 segundos los contadores e histogramas `opstracker_http_requests_total`, `opstracker_http_request_duration_ms` y `opstracker_http_errors_total` etiquetados por `endpoint`, `method`, `statusCode` y `status_class`.
- **Trazas Distribuidas**: Mediante `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-fastify` y `@opentelemetry/instrumentation-pg`, cada solicitud HTTP genera un span padre que propaga automáticamente su contexto hacia los spans hijos de cada consulta SQL ejecutada en PostgreSQL.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 9.** Logs estructurados en el stream `opstracker_logs` de OpenObserve mostrando operaciones HTTP, códigos `200`/`201`/`500`, latencias (`duration_ms`) y correlación mediante `trace_id`.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 10.** Visualización de una traza distribuida individual en la sección *Trazas* de OpenObserve, evidenciando el span padre de la petición HTTP en Fastify y el span hijo de la consulta SQL en PostgreSQL.

---

### 3.5 RF-05: Monitoreo de Infraestructura en AWS EC2 (CPU, RAM, Red y Temperatura)

Para monitorear la instancia Ubuntu en AWS EC2, se desarrolló un recolector continuo en Python (`monitoring/collector.py`) empaquetado como servicio dentro de `docker-compose.prod.yml` (`opstracker-ec2-metrics`) con `pid: "host"`, `network_mode: "host"` y volúmenes de solo lectura hacia `/proc` y `/sys`. Cada 10 segundos transmite al stream `ec2_metrics` de OpenObserve (`/api/default/ec2_metrics/_json`) las cuatro métricas requeridas:

1. **CPU**: Porcentaje de uso global (`cpu_usage_percent`) y número de núcleos lógicos.
2. **Memoria RAM**: Porcentaje de utilización (`memory_usage_percent`), memoria usada, disponible y total en MB.
3. **Ancho de Banda (Red)**: Tasa diferencial de transmisión y recepción (`network_tx_kbps`, `network_rx_kbps`, bytes/s y Mbps).
4. **Temperatura**: El recolector inspecciona primero sensores físicos reales en `/sys/class/thermal/thermal_zone*/temp` y `psutil.sensors_temperatures()`. Debido a que las instancias virtualizadas de AWS EC2 (hipervisores Nitro/Xen) no exponen los registros térmicos físicos (MSRs) del procesador al sistema operativo invitado —a diferencia de instancias *Bare Metal*—, el recolector implementa un mecanismo de respaldo determinista basado en la curva térmica TDP según la carga de CPU, etiquetando explícitamente el origen en el campo `temperature_source` (`"physical_sensor"` o `"estimated_tdp"`).

---

### 3.6 RF-06: Tablero Unificado y Alertas Operativas en OpenObserve

Se consolidó un **Tablero Unificado** (*OpsTracker — Unified Operations & Observability*) en OpenObserve integrando 9 paneles alimentados por consultas SQL sobre los streams `cicd_logs`, `opstracker_logs` y `ec2_metrics`, cumpliendo el **Criterio de Aceptación 3** al mostrar simultáneamente:

- Historial y proporción éxito/fallo del pipeline CI/CD.
- Logs estructurados con `trace_id`, distribución de códigos HTTP (`2xx`, `4xx`, `5xx`) y latencia promedio por endpoint.
- Gráficas temporales de **CPU (%)**, **Memoria RAM (%)**, **Ancho de Banda (TX/RX kbps)** y **Temperatura (°C)** de la instancia AWS EC2.

Adicionalmente, se configuró el canal de notificación `OpsTracker_Webhook` y **3 reglas de alerta operativa** evaluadas periódicamente cada 5 minutos:

| Nombre de la Alerta | Stream | Condición de Disparo | Severidad |
| :--- | :--- | :--- | :--- |
| `opstracker_cicd_failure` | `cicd_logs` | `count(*) >= 1` donde `event_type = 'test_execution' AND status = 'failure'` | Crítica |
| `opstracker_http_5xx_errors` | `opstracker_logs` | `count(*) >= 3` donde `statuscode >= 500` | Alta |
| `opstracker_ec2_high_cpu` | `ec2_metrics` | `avg(cpu_usage_percent) > 85` | Advertencia |

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 11.** Tablero unificado en OpenObserve mostrando de forma simultánea los eventos del pipeline CI/CD, métricas/logs HTTP de la aplicación y gráficas de CPU, Memoria RAM, Ancho de Banda y Temperatura de la instancia AWS EC2.

> **[INSERTAR CAPTURA AQUÍ]**  
> **Figura 12.** Panel de alertas operativas en OpenObserve con las tres reglas activas (`opstracker_cicd_failure`, `opstracker_ec2_high_cpu`, `opstracker_http_5xx_errors`) y registro de transición a estado *En disparo / Crítico*.

---

## 4. Tabla de Enlaces y Credenciales del Sistema

> **Nota de seguridad**: Por buenas prácticas de ciberseguridad, **nunca** se incluye la llave privada SSH (`.pem`) ni credenciales administrativas de la cuenta de AWS en el repositorio ni en este documento. Se proporcionan únicamente los enlaces de acceso y credenciales dedicadas de evaluación para la verificación del sistema.

| Recurso / Servicio | URL / Dirección de Acceso | Usuario / Identificador | Contraseña / Notas de Acceso |
| :--- | :--- | :--- | :--- |
| **Repositorio GitHub (Código y Workflow CI/CD)** | `https://github.com/AngelDevHub/Proyect_CI-CD` | Acceso público *(o especificar si es privado)* | Ver pestaña **Actions** para historial de ejecuciones |
| **Aplicación Web OpsTracker (AWS EC2 — Login / Register / CRUD Users / Tasks)** | `http://18.218.32.210` | `admin@opstracker.com` | `Admin123!` *(también permite crear cuentas nuevas desde la pestaña **Register**)* |
| **API REST Backend (Healthcheck)** | `http://18.218.32.210:3001/api/health` | No requiere autenticación | Fastify + PostgreSQL (Puerto `3001`) |
| **Plataforma OpenObserve (Dashboards, Logs, Trazas y Alertas)** | `http://18.218.32.210:5080` | `root@example.com` *(o usuario dedicado de evaluación)* | `Complexpass#123` *(cambiar por contraseña dedicada antes de entrega final si aplica)* |
| **Instancia AWS EC2 (Acceso SSH)** | `18.218.32.210` (Puerto `22`) | `ubuntu` | Protegido mediante llave privada `.pem` almacenada exclusivamente en GitHub Secrets (`EC2_SSH_KEY`) |

---

## 5. Conclusiones

*(Aplicar formato de texto justificado)*

La implementación del proyecto **OpsTracker** permitió validar en un entorno real en la nube de AWS la sinergia entre automatización CI/CD, pruebas integrales y observabilidad moderna. La incorporación de una compuerta de calidad basada en Jest y Playwright dentro de GitHub Actions demostró ser altamente efectiva para prevenir despliegues defectuosos: ante regresiones visuales o funcionales, el pipeline detuvo la ejecución de forma determinista, mantuvo cerrada la conexión SSH hacia AWS EC2 y dejó registro auditable del incidente en OpenObserve. Por el contrario, los cambios válidos fueron compilados, verificados y desplegados en producción de manera repetible y sin intervención manual.

Asimismo, la instrumentación con OpenTelemetry (OTLP/HTTP) y la recolección de telemetría del servidor EC2 evidenciaron el valor de centralizar logs estructurados, métricas aplicativas, trazas distribuidas de base de datos, eventos de CI/CD y métricas de hardware (CPU, RAM, ancho de banda y temperatura) en una sola plataforma como OpenObserve. Esto reduce drásticamente el tiempo medio de detección y diagnóstico (*MTTD/MTTR*) frente a fallos HTTP o saturación de recursos, estableciendo una base sólida y extensible para operar sistemas productivos bajo estándares DevOps y SRE.
