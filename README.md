# Sistema de Turnos Medicos (React + Node)

Aplicacion full stack para gestionar turnos medicos.

## Tecnologias

- Frontend: React + Vite
- Backend: Node.js + Express
- Cliente HTTP: Axios
- Manejo de fechas: Day.js

## Estructura

- `client`: aplicacion React
- `server`: API REST para turnos

Persistencia de datos:

- `server/data/store.json`: guarda administrador, medicos y turnos

## Requisitos

- Node.js 18 o superior

## Instalacion

1. Instalar dependencias del cliente:
   - `cd client`
   - `npm install`
2. Instalar dependencias del servidor:
   - `cd ../server`
   - `npm install`

## Ejecutar en desarrollo

1. Iniciar API:
   - `cd server`
   - `npm run dev`
2. Iniciar frontend:
   - `cd client`
   - `npm run dev`

La app web queda normalmente en `http://localhost:5173`.

## Paginas

- `/reservas`: formulario publico para pedir turnos
- `/admin`: panel privado para ver y cancelar turnos

En `/admin` ahora tambien puedes:

- Crear medicos
- Asignar dias y horarios de atencion por medico
- Quitar dias de atencion

## Acceso administrador

- El administrador se crea una sola vez desde `/admin`.
- Para crear la cuenta se piden: email, usuario y contrasena.
- Si ya existe una cuenta, no se puede volver a crear: se usa `Restablecer acceso`.
- El restablecimiento exige el email registrado y permite definir nuevo usuario y contrasena.

Opcionalmente puedes preconfigurar el admin en `.env` con:

- `ADMIN_EMAIL`
- `ADMIN_USER`
- `ADMIN_PASSWORD`

## Endpoints principales

- `GET /api/health`: estado de la API
- `GET /api/doctors`: lista de medicos
- `GET /api/appointments/availability?doctorId=...&date=YYYY-MM-DD`: horas ya ocupadas
- `GET /api/appointments`: lista de turnos
- `POST /api/appointments`: crear turno
- `DELETE /api/appointments/:id`: cancelar turno

Endpoints admin para medicos:

- `GET /api/admin/doctors`
- `POST /api/admin/doctors`
- `PUT /api/admin/doctors/:id/schedule`

## Campos para crear turno

```json
{
  "patientName": "Juan Perez",
   "patientPhone": "+54 11 5555 5555",
  "doctorId": "doc-1",
  "date": "2026-07-12",
  "time": "10:30",
  "notes": "Control general"
}
```
