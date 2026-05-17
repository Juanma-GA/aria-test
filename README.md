# IA Audit Tool

Herramienta web para controlar auditorías de casos de uso de IA, POCs e implementaciones en producción.

## Local Setup

### Prerequisites
- **Node.js 18+** (https://nodejs.org)
- **npm 9+** (incluido con Node.js)
- **MongoDB 6+** corriendo localmente o remotamente (https://www.mongodb.com/try/download/community)

### 1. Clonar el repositorio
```bash
git clone https://github.com/Juanma-GA/aria-test.git
cd aria-test
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crear un archivo `.env.local` en la raíz del proyecto:

```env
MONGODB_URI=mongodb://localhost:27017/aria-audit
JWT_SECRET=aria-super-secret-key-change-in-production-2025
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

**Nota:** Si MongoDB está en otro servidor/puerto, actualizar `MONGODB_URI`.

### 4. Iniciar MongoDB
Asegúrate de que MongoDB está corriendo:

**Docker (recomendado):**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:6
```

**O localmente (macOS/Linux):**
```bash
mongod --dbpath /data/db
```

### 5. Seedear la base de datos (primera vez solamente)
Inicia la app primero:
```bash
npm run dev
```

Luego en la consola del navegador (F12 → Console), ejecuta:
```javascript
fetch('/api/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
```

Esto crea:
- **Usuario admin:** marie.dupont@atexis.com
- **Usuario demo:** carlos.vega@atexis.com
- **Auditorías de demo** con procesos, casos de uso y POCs

### 6. Login
Visita http://localhost:3000 y solicita las credenciales al team lead.

### 7. (Opcional) Reparar auditorías con team[] vacío
Si tienes auditorías con arrays `team[]` vacíos de antes de la correción de ObjectId, ejecuta:

```bash
npm run ts-node scripts/fix-empty-teams.ts
```

Esta migración es segura para ejecutar múltiples veces (idempotente).

---

## Autenticación & Usuarios

### Cómo funciona:
- **Sin registro público** - usuarios creados via seed o panel admin
- **Usuarios almacenados en MongoDB** (colección Users)
- **Acceso solo por login** - JWT tokens con 8 horas de expiración
- **Roles:** admin, consultant, viewer

### Roles de usuario:
- **admin:** Acceso completo a todas las auditorías y features admin
- **consultant:** Puede ver/editar auditorías donde es miembro del equipo
- **viewer:** Acceso solo lectura a todas las auditorías

### Agregar nuevos usuarios:
1. Crear usuarios via API o directamente en MongoDB
2. Asignar email, password hash, nombre y role
3. Compartir credenciales fuera de banda (no via email en la app)

---

## Scripts disponibles

- `npm run dev` — Servidor de desarrollo con hot reload
- `npm run build` — Build para producción
- `npm run start` — Iniciar servidor de producción
- `npm run lint` — Ejecutar ESLint
- `npm test` — Ejecutar tests unitarios
- `npm test:e2e` — Ejecutar tests E2E con Playwright

## Características

- Gestión de auditorías de IA
- Control de POCs
- Monitoreo de implementaciones en producción
- Interfaz web intuitiva con Next.js y Tailwind CSS
- Backend con API routes de Next.js
- Base de datos MongoDB

## Tecnologías

- **Frontend:** Next.js 16, React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Mongoose
- **Base de datos:** MongoDB
- **Autenticación:** JWT + cookies HTTP-only
- **Testing:** Vitest, Playwright