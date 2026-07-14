# Documentación de la API de ARIA para integración con Power BI

> **Alcance de este análisis**: revisión del código fuente del backend de ARIA (repositorio `aria-test`, aplicación Next.js 16 con App Router). No se ha accedido al servidor en ejecución `https://172.21.28.92/Customizations/Aria/dashboard`; todo lo aquí documentado se ha extraído directamente del código fuente (rutas `app/api/**/route.ts`, modelos Mongoose en `lib/models/`, middleware de autenticación y capa de acceso a datos).
>
> **Fecha del análisis**: 2026-07-14

---

## 1. Resumen ejecutivo

- ARIA **no expone GraphQL ni SOAP**. Toda la API es **REST sobre JSON**, implementada como *route handlers* de Next.js (`app/api/**/route.ts`).
- Existen además **3 endpoints de exportación tabular en CSV**, pensados específicamente para extraer datos "planos" (use cases, procesos, PoCs) — son el punto de entrada más directo para Power BI.
- La autenticación es **JWT propio** (cookies httpOnly o cabecera `Authorization: Bearer`), no OAuth2/OIDC estándar ni API Key.
- No hay documentación OpenAPI/Swagger en el repositorio (`openapi*`, `swagger*` → no se encontró ningún fichero).
- La paginación es prácticamente inexistente (solo implementada parcialmente en `GET /api/audits`); la mayoría de endpoints devuelven el listado completo.
- No hay rate limiting general de la API — solo existe en el login (5 intentos / 15 min por IP).

---

## 2. ¿Existe una API REST expuesta?

**Sí.** La aplicación es un monolito Next.js donde el propio frontend consume su API interna vía `fetch`. Esa misma API es accesible externamente en la misma base URL que la UI (misma app, mismo dominio/puerto), bajo el prefijo `/api/`.

### 2.1 Prefijo de ruta (`basePath`)

`next.config.js` define un `basePath` configurable por entorno:

```js
// next.config.js
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  ...
};
```

Dado que la URL de producción observada es `https://172.21.28.92/Customizations/Aria/dashboard`, es muy probable que `NEXT_PUBLIC_BASE_PATH=/Customizations/Aria/dashboard` esté configurado en ese entorno. Esto implica que **todas las rutas de API documentadas abajo deben prefijarse con ese basePath** en producción, por ejemplo:

```
https://172.21.28.92/Customizations/Aria/dashboard/api/audits
```

> ⚠️ Hay que confirmar el valor exacto de `NEXT_PUBLIC_BASE_PATH` en el entorno de producción (variable de entorno del servidor) antes de construir las URLs finales en Power BI.

---

## 3. Autenticación

### 3.1 Mecanismo

JWT firmado con `HS256` (librería `jose`), **no** OAuth2/OIDC, **no** API Key dedicada.

| Elemento | Detalle |
|---|---|
| Login | `POST /api/auth/login` con `{ email, password }` |
| Verificación de password | `bcryptjs` contra `passwordHash` almacenado en Mongo |
| Token de acceso | JWT, expira en **8 horas** |
| Token de refresco | JWT, expira en **7 días** (uso: `signRefreshToken`, no se vio endpoint `/refresh` explícito en las rutas revisadas) |
| Transporte | Cookie `httpOnly` `access_token` / `refresh_token`, **o** cabecera `Authorization: Bearer <token>` |
| Rate limit de login | 5 intentos / 15 min por IP (`429 Too Many Requests`, header `Retry-After`) |

Código relevante — `lib/auth.ts`:

```ts
const ACCESS_TOKEN_DURATION = '8h';
const REFRESH_TOKEN_DURATION = '7d';

export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (token) return verifyToken(token);
  return null;
}
```

El `middleware.ts` global intercepta **todas** las rutas (excepto `/auth/login`, `/api/auth/login`, `/api/health`, `/api/cron/*`) y exige la cookie `access_token` válida; si no está presente en una ruta `/api/*`, responde `401` directamente antes de llegar al handler.

### 3.2 Ejemplo de login (obtención de token)

**Request**

```http
POST /api/auth/login HTTP/1.1
Host: 172.21.28.92
Content-Type: application/json

{
  "email": "usuario@empresa.com",
  "password": "********"
}
```

**Response 200**

```json
{
  "user": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "email": "usuario@empresa.com",
    "name": "Nombre Apellido",
    "role": "consultant"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Además del `accessToken` en el body, la respuesta fija las cookies `access_token` y `refresh_token` (`httpOnly`, `secure` en producción, `sameSite=lax`).

**Uso en llamadas posteriores** (recomendado para Power BI, ya que Power Query no maneja cookies de forma nativa de manera cómoda):

```http
GET /api/audits HTTP/1.1
Host: 172.21.28.92
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3.3 Roles y control de acceso

Tres roles globales: `admin`, `consultant`, `viewer`. El middleware inyecta cabeceras internas (`x-user-id`, `x-user-role`, `x-user-email`, `x-user-name`) que los handlers usan para autorización:

- `admin`: acceso total.
- `viewer` (global): lectura de todo, sin escritura.
- `consultant`: solo audits donde aparece en `team[]`, con rol por-audit (`owner` / `editor` / `viewer`).

Para extracción hacia Power BI, **la cuenta ideal es un usuario con rol `admin` o `viewer` global**, de forma que `GET /api/audits` y derivados devuelvan todos los registros sin necesidad de pertenecer al `team[]` de cada auditoría.

---

## 4. Formato de respuesta

- **JSON** en la inmensa mayoría de endpoints (`Content-Type: application/json`), sin sobre (`envelope`) estándar tipo JSON:API — se devuelve el array/objeto directamente.
- **CSV** en los 3 endpoints de exportación (`Content-Type: text/csv; charset=utf-8`, con BOM UTF-8 `﻿` para compatibilidad con Excel, y `Content-Disposition: attachment`).
- No hay XML ni SOAP en ningún punto del código.
- No hay un formato de error estandarizado más allá de `{ "error": "mensaje" }` con el status HTTP correspondiente (400/401/403/404/409/429/500).

---

## 5. Inventario de endpoints

### 5.1 Autenticación

| Método | Ruta | Descripción | Auth requerida |
|---|---|---|---|
| POST | `/api/auth/login` | Login, devuelve JWT + cookies | No (público) |
| POST | `/api/auth/logout` | Invalida sesión (borra cookies) | Sí |
| GET | `/api/auth/me` | Devuelve el usuario autenticado actual | Sí |

### 5.2 Audits (auditorías) — entidad raíz

| Método | Ruta | Descripción | Parámetros |
|---|---|---|---|
| GET | `/api/audits` | Lista auditorías visibles para el usuario, **enriquecidas** con métricas agregadas (ROI, ahorro anual, coste de desarrollo, payback, nº de PoCs por fase, etc.) | `?archived=true\|false`, `?page=N`, `?limit=N` (máx. 100) |
| POST | `/api/audits` | Crea una auditoría | Body JSON (`name`, `client`, `sector`, `classification`, ...) |
| GET | `/api/audits/[auditId]` | Detalle de una auditoría | — |
| GET | `/api/audits/[auditId]/report-data` | Datos agregados para informe (JSON) | `?withAi=1` |
| GET | `/api/audits/[auditId]/report` | Genera HTML de informe (no tabular) | `?withAi=1` |
| GET | `/api/audits/[auditId]/roadmap` | Datos de roadmap por auditoría | — |
| GET/POST | `/api/audits/[auditId]/team` | Gestión de equipo por auditoría | — |
| GET | `/api/audits/[auditId]/access` | Info de acceso/permisos | — |

### 5.3 Processes (procesos auditados)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/audits/[auditId]/processes` | Lista/crea procesos de una auditoría |
| GET/PATCH | `/api/audits/[auditId]/processes/[procId]` | Detalle/edición de un proceso (incluye bloques B1, B2, B3) |
| POST | `/api/audits/[auditId]/processes/copy/[sourceProcId]` | Duplica un proceso |
| GET/PATCH | `/api/audits/[auditId]/processes/[procId]/b2` | Bloque de soberanía (B2) |

### 5.4 Use Cases (casos de uso de IA)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/usecases` | **Listado global** de use cases visibles, enriquecido con datos de audit y process | `?parentUCId=<id>` para instancias |
| GET | `/api/usecases/[ucId]` | Use case individual por ID (global, cross-audit, sin scoping de auditoría) |
| GET/POST | `/api/audits/[auditId]/usecases` | Listado/creación de use cases dentro de una auditoría |
| GET/PATCH | `/api/audits/[auditId]/usecases/[cuId]` | Detalle/edición (scoring B6, ROI, compute breakdown, etc.) |
| POST | `/api/audits/[auditId]/usecases/[cuId]/ai/recalculate` | Recalcula coste/tiempo vía LLM (no tabular) |

### 5.5 PoCs (Proof of Concept)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/pocs` | Listado global de PoCs visibles | `?auditId=`, `?archived=true`, `?include=mockups` |
| GET | `/api/pocs/[pocId]` | Detalle de un PoC |
| GET/POST | `/api/audits/[auditId]/pocs` | PoCs de una auditoría |
| GET/PATCH | `/api/audits/[auditId]/pocs/[pocId]` | Detalle/edición (fases: design, execution, evaluation, decision) |

### 5.6 Industrializations

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/industrializations` | Listado global, enriquecido con audit/useCase/POC |
| GET/POST | `/api/audits/[auditId]/industrializations` | Por auditoría |
| GET/PATCH | `/api/audits/[auditId]/industrializations/[indId]` | Detalle/edición |
| POST | `/api/audits/[auditId]/industrializations/from-poc/[pocId]` | Crea industrialización a partir de un PoC |

### 5.7 Otros catálogos y administración

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/users` | Directorio de usuarios (admin ve todo; el resto, campos mínimos) |
| GET/PATCH | `/api/users/[userId]` | Detalle/edición de usuario |
| GET | `/api/roadmap` | Roadmap global |
| GET | `/api/suggestions` | Sugerencias (contexto IA) |
| GET/POST | `/api/admin/catalog` | Catálogo de modelos IA / GPUs |
| GET | `/api/admin/catalog/stats` | Estadísticas de última sincronización/refresh del catálogo |
| GET/POST | `/api/admin/profiles` | Perfiles de coste (roles/tarifas) |
| GET | `/api/health` | Health-check (`{status, version, timestamp}`), **sin autenticación** |

### 5.8 Endpoints de exportación tabular (⭐ los más relevantes para Power BI)

Estos 3 endpoints generan **CSV directamente descargable**, específicamente pensados para exportar datos planos de una auditoría concreta:

| Método | Ruta | Contenido |
|---|---|---|
| GET | `/api/audits/[auditId]/export/usecases` | Use cases: ID, proceso, descripción, tipos de IA, puntuaciones D1–D6, categoría, ahorro anual, coste de desarrollo, semanas de implementación, estado |
| GET | `/api/audits/[auditId]/export/processes` | Procesos: ID, nombre, departamento, responsable, actividades (una fila por actividad), horas/ejecución, repeticiones anuales, perfiles |
| GET | `/api/audits/[auditId]/export/pocs` | PoCs: ID, use case, proceso, fase, decisión, objetivo, fechas, hitos completados, resultados, coste real, lecciones aprendidas |

#### Ejemplo de request/response — export de use cases

**Request**

```http
GET /api/audits/65f1a2b3c4d5e6f7a8b9c0d1/export/usecases HTTP/1.1
Host: 172.21.28.92
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response 200**

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="AuditoriaX_use_cases.csv"
```

```csv
UC ID,Process,Description,AI Types,D1,D2,D3,D4,D5,D6,Total Score,Category,Time Saved (h/run),Annual Saving (€),Dev Cost (€),Impl. Weeks,Status,Notes
AUD-003-P01-UC01,AUD-003-P01 – Gestión documental,Extracción automática de datos técnicos,extraction_nlp; validation,4,4,3,4,3,4,22,Quick Win,2.5,18500,32000,6,eligible,
```

Código fuente: `app/api/audits/[auditId]/export/usecases/route.ts:31-138`.

---

## 6. Paginación y rate limiting

| Aspecto | Estado |
|---|---|
| Paginación general | **No implementada** en la mayoría de endpoints. Devuelven el array completo. |
| Paginación en `/api/audits` | Sí: `?page=N&limit=N` (limit máx. 100; si no se especifica, devuelve todo) |
| Rate limiting general de API | **No existe** (in-memory `Map`, solo aplicado al login) |
| Rate limiting de login | 5 intentos / 15 minutos por IP → `429` + header `Retry-After` |
| Límite de tamaño de respuesta | No hay límite explícito; para auditorías con muchos procesos/use cases, `GET /api/audits` puede ser costoso (hace `Promise.all` sobre todos los procesos/use cases de todas las auditorías visibles) |

> Para extracciones periódicas hacia Power BI, conviene usar filtros por auditoría (`/api/audits/[auditId]/...`) en lugar de los endpoints globales (`/api/usecases`, `/api/pocs`) cuando el volumen de datos crezca, ya que estos últimos no paginan.

---

## 7. Alternativas si no se quisiera usar la API REST

Aunque la API REST **sí existe** y es la vía recomendada, se documentan las alternativas por completitud:

### 7.1 Acceso directo a base de datos

| Elemento | Detalle |
|---|---|
| Motor | **MongoDB** (vía Mongoose 8.x) |
| Cadena de conexión | `MONGODB_URI` (ej. `mongodb://localhost:27017/aria-audit`) — variable de entorno del servidor |
| Colecciones relevantes (nombre por defecto de Mongoose = plural en minúsculas) | `audits`, `processes`, `usecases`, `pocs`, `industrializations`, `catalogs`, `catalogstats`, `profiles`, `users`, `roadmaps`, `counters` |

Power BI dispone de un **conector nativo de MongoDB** (vía ODBC/conector de terceros o `Get Data → More → Database → MongoDB` en versiones recientes), pero esto requeriría:
- Abrir el puerto de MongoDB a la red donde corre Power BI/Gateway (riesgo de seguridad, no recomendable exponerlo tal cual).
- Aplanar manualmente documentos anidados (los modelos usan sub-documentos ricos: `b1/b2/b3` en Process, `computeBreakdown`, `score.dimensions`, `timeSavedPerProfile[]`, etc.) — Power Query tendría que hacer bastante transformación M para desanidar JSON tipo BSON.
- Los datos de negocio (ROI, ahorro anual, categoría de score) que hoy calcula el backend (`app/api/audits/route.ts`, `lib/pocRoi.ts`, `lib/calculations.ts`) **no están persistidos**, se calculan al vuelo — habría que reimplementar esa lógica en Power Query/DAX si se salta la API.

### 7.2 Exportaciones programadas / CSV

Ya existen los 3 endpoints CSV documentados en el punto 5.8. No hay ningún mecanismo de exportación **programada** (cron) de estos ficheros — el único cron detectado (`app/api/cron/refresh-catalog/route.ts`) sirve para refrescar el catálogo de modelos IA vía Tavily/LLM, no para exportar datos de negocio.

### 7.3 Webhooks / sincronización

No se ha encontrado ningún mecanismo de webhook saliente ni sistema de sincronización push en el código (`grep` sobre el repo no muestra ninguna integración de este tipo). Toda la interacción es *pull* (el cliente llama a la API).

---

## 8. Recomendación para integración con Power BI

**Método recomendado: Power Query (Web/JSON connector) contra los endpoints REST JSON, complementado con los endpoints CSV para tablas ya aplanadas.**

Razones:

1. **No hace falta OAuth2 complejo** — basta con hacer un `Web.Contents` con `POST /api/auth/login` para obtener el `accessToken`, y luego usarlo como `Authorization: Bearer` en las llamadas siguientes vía `Web.Contents(url, [Headers=[Authorization="Bearer " & token]])`. Es el patrón estándar de "Web API con token" en Power Query M.
2. **Los endpoints `/export/*` ya devuelven CSV listo para tabla** (use cases, procesos, PoCs) — son la vía más rápida y de menor esfuerzo de transformación en Power Query (`Csv.Document` directo, sin necesidad de `Table.ExpandRecordColumn` en cascada).
3. **Los endpoints JSON globales** (`/api/usecases`, `/api/pocs`, `/api/industrializations`, `/api/audits`) aportan las métricas agregadas de ROI/ahorro que **no** están en los CSV de exportación (esos CSV son por-auditoría; los JSON globales agregan a nivel de portafolio). Combinar ambos según la necesidad del dashboard.
4. **No usar conexión directa a MongoDB** salvo necesidad justificada: expondría la base de datos a la red de BI, obligaría a reimplementar en Power Query toda la lógica de negocio (ROI, scoring, categorización) que hoy vive en el backend, y MongoDB no es un origen de "primera clase" en Power BI (requiere conectores de terceros o ODBC, con soporte limitado en el Gateway on-premises).
5. **Cuenta de servicio dedicada**: crear un usuario ARIA con rol `viewer` global (o `admin` si se necesita acceso a `/api/users` u otros endpoints de administración) exclusivamente para la extracción de Power BI, en vez de reutilizar una cuenta personal — así el JWT de 8h se puede refrescar de forma predecible en el flujo programado de Power BI (refresco automático diario), sin depender de la sesión de un usuario real.
6. **Cuidado con el `basePath`**: verificar en el servidor de producción el valor de `NEXT_PUBLIC_BASE_PATH` y usarlo como prefijo en todas las URLs configuradas en Power Query.

### Ejemplo de flujo en Power Query (M), esquema conceptual

```m
let
    baseUrl = "https://172.21.28.92/Customizations/Aria/dashboard",
    loginResponse = Json.Document(
        Web.Contents(
            baseUrl & "/api/auth/login",
            [
                Content = Json.FromValue([email="powerbi-service@empresa.com", password="********"]),
                Headers = [#"Content-Type"="application/json"]
            ]
        )
    ),
    token = loginResponse[accessToken],
    usecasesJson = Json.Document(
        Web.Contents(
            baseUrl & "/api/usecases",
            [ Headers = [Authorization = "Bearer " & token] ]
        )
    ),
    tabla = Table.FromRecords(usecasesJson)
in
    tabla
```

> Nota de seguridad: la contraseña de la cuenta de servicio no debe quedar en texto plano en el fichero `.pbix` — usar parámetros de Power BI Service con credenciales gestionadas, o un "gateway" que almacene el secreto de forma segura.

---

## 9. Limitaciones de este análisis

- No se ha verificado el comportamiento real del servidor en `172.21.28.92` (sin acceso de red desde este entorno); todo lo anterior se basa en el código fuente del repositorio.
- No se ha confirmado el valor real de `NEXT_PUBLIC_BASE_PATH`, `MONGODB_URI` ni otras variables de entorno de producción — deben obtenerse del equipo de infraestructura/DevOps que gestiona ese servidor.
- No existe documentación OpenAPI/Swagger versionada en el repo; este documento debería mantenerse actualizado manualmente si cambian las rutas (siguiendo la política del proyecto de que los ficheros de `/references/` son de mantenimiento manual, este fichero se ha creado en la raíz del repo, no en `/references/`).
