const fs = require('fs')
const path = require('path')

const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8
const TMP_DATA_FILE = '/tmp/turnos-store.json'
const BUNDLED_DATA_FILE = path.join(process.cwd(), 'server', 'data', 'store.json')

const defaultDoctors = [
	{
		id: 'doc-1',
		name: 'Dra. Ana Perez',
		specialty: 'Clinica Medica',
		office: 'Consultorio 101',
		schedule: [
			{ day: 1, start: '09:00', end: '14:00' },
			{ day: 3, start: '09:00', end: '14:00' },
			{ day: 5, start: '09:00', end: '14:00' },
		],
	},
	{
		id: 'doc-2',
		name: 'Dr. Carlos Gomez',
		specialty: 'Cardiologia',
		office: 'Consultorio 202',
		schedule: [
			{ day: 2, start: '10:00', end: '17:00' },
			{ day: 4, start: '10:00', end: '17:00' },
		],
	},
	{
		id: 'doc-3',
		name: 'Dra. Sofia Martinez',
		specialty: 'Pediatria',
		office: 'Consultorio 303',
		schedule: [
			{ day: 1, start: '08:00', end: '13:00' },
			{ day: 2, start: '08:00', end: '13:00' },
			{ day: 3, start: '08:00', end: '13:00' },
			{ day: 4, start: '08:00', end: '13:00' },
		],
	},
]

function cloneData(value) {
	return JSON.parse(JSON.stringify(value))
}

function generateId() {
	if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
		return globalThis.crypto.randomUUID()
	}

	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function parseDateTime(date, time) {
	return new Date(`${date}T${time}:00`)
}

function isValidTime(value) {
	return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

function toMinutes(value) {
	const [hour, minute] = value.split(':').map(Number)
	return hour * 60 + minute
}

function normalizeSchedule(input) {
	if (!Array.isArray(input)) {
		return null
	}

	const normalized = []
	for (const item of input) {
		const day = Number(item?.day)
		const start = `${item?.start || ''}`
		const end = `${item?.end || ''}`

		if (!Number.isInteger(day) || day < 0 || day > 6) {
			return null
		}

		if (!isValidTime(start) || !isValidTime(end)) {
			return null
		}

		if (toMinutes(start) >= toMinutes(end)) {
			return null
		}

		normalized.push({ day, start, end })
	}

	return normalized.sort((a, b) => {
		if (a.day !== b.day) {
			return a.day - b.day
		}

		return toMinutes(a.start) - toMinutes(b.start)
	})
}

function isValidEmail(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function readPersistedState() {
	const candidates = [TMP_DATA_FILE, BUNDLED_DATA_FILE]

	for (const candidate of candidates) {
		if (!fs.existsSync(candidate)) {
			continue
		}

		try {
			const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
			return {
				adminAccount: parsed?.adminAccount || null,
				doctors: Array.isArray(parsed?.doctors) ? parsed.doctors : cloneData(defaultDoctors),
				appointments: Array.isArray(parsed?.appointments) ? parsed.appointments : [],
			}
		} catch (_) {
			continue
		}
	}

	return {
		adminAccount: null,
		doctors: cloneData(defaultDoctors),
		appointments: [],
	}
}

function getState() {
	if (!globalThis.__turnosState) {
		const initial = readPersistedState()
		globalThis.__turnosState = {
			adminAccount: initial.adminAccount,
			doctors: initial.doctors,
			appointments: initial.appointments,
			adminSessions: new Map(),
		}
	}

	return globalThis.__turnosState
}

function saveState(state) {
	const payload = {
		adminAccount: state.adminAccount,
		doctors: state.doctors,
		appointments: state.appointments,
		updatedAt: new Date().toISOString(),
	}

	try {
		fs.writeFileSync(TMP_DATA_FILE, JSON.stringify(payload, null, 2), 'utf8')
	} catch (_) {
		// In serverless runtimes persistence may fail; app keeps working in-memory.
	}
}

function json(res, status, payload) {
	res.statusCode = status
	res.setHeader('Content-Type', 'application/json; charset=utf-8')
	res.end(JSON.stringify(payload))
}

function parseBody(req) {
	return new Promise((resolve) => {
		if (req.method === 'GET' || req.method === 'DELETE') {
			resolve({})
			return
		}

		let raw = ''
		req.on('data', (chunk) => {
			raw += chunk
		})

		req.on('end', () => {
			if (!raw.trim()) {
				resolve({})
				return
			}

			try {
				resolve(JSON.parse(raw))
			} catch (_) {
				resolve({ __invalidJson: true })
			}
		})
	})
}

function requireAdminAuth(req, state) {
	const authHeader = req.headers.authorization || ''
	const token = authHeader.startsWith('Bearer ')
		? authHeader.slice('Bearer '.length).trim()
		: null

	if (!token) {
		return { ok: false, status: 401, message: 'No autorizado.' }
	}

	const expiresAt = state.adminSessions.get(token)
	if (!expiresAt || expiresAt < Date.now()) {
		if (expiresAt) {
			state.adminSessions.delete(token)
		}

		return { ok: false, status: 401, message: 'Sesion invalida o expirada.' }
	}

	return { ok: true }
}

function findDoctorById(state, doctorId) {
	return state.doctors.find((doctor) => doctor.id === doctorId)
}

function hasConflict(state, doctorId, date, time, ignoreId = null) {
	return state.appointments.some((appointment) => {
		if (ignoreId && appointment.id === ignoreId) {
			return false
		}

		return (
			appointment.doctorId === doctorId &&
			appointment.date === date &&
			appointment.time === time
		)
	})
}

module.exports = async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')

	if (req.method === 'OPTIONS') {
		res.statusCode = 204
		res.end()
		return
	}

	const url = new URL(req.url, 'http://localhost')
	const pathname = url.pathname
	const state = getState()
	const body = await parseBody(req)

	if (body.__invalidJson) {
		return json(res, 400, { message: 'JSON invalido.' })
	}

	if (req.method === 'GET' && pathname === '/api/health') {
		return json(res, 200, { ok: true })
	}

	if (req.method === 'GET' && pathname === '/api/doctors') {
		return json(res, 200, state.doctors)
	}

	if (req.method === 'GET' && pathname === '/api/appointments/availability') {
		const doctorId = `${url.searchParams.get('doctorId') || ''}`
		const date = `${url.searchParams.get('date') || ''}`

		if (!doctorId || !date) {
			return json(res, 400, { message: 'doctorId y date son obligatorios.' })
		}

		const doctor = findDoctorById(state, doctorId)
		if (!doctor) {
			return json(res, 404, { message: 'El medico seleccionado no existe.' })
		}

		const occupiedTimes = state.appointments
			.filter((appointment) => appointment.doctorId === doctorId && appointment.date === date)
			.map((appointment) => appointment.time)
			.sort((a, b) => toMinutes(a) - toMinutes(b))

		return json(res, 200, { occupiedTimes })
	}

	if (req.method === 'GET' && pathname === '/api/admin/status') {
		return json(res, 200, { configured: Boolean(state.adminAccount) })
	}

	if (req.method === 'POST' && pathname === '/api/admin/login') {
		const username = body?.username
		const password = body?.password

		if (!state.adminAccount) {
			return json(res, 400, { message: 'Primero debes crear el usuario administrador.' })
		}

		if (username !== state.adminAccount.username || password !== state.adminAccount.password) {
			return json(res, 401, { message: 'Credenciales invalidas.' })
		}

		const token = generateId()
		const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS
		state.adminSessions.set(token, expiresAt)
		return json(res, 200, { token, expiresAt })
	}

	if (req.method === 'POST' && pathname === '/api/admin/register') {
		const email = `${body?.email || ''}`.trim().toLowerCase()
		const username = `${body?.username || ''}`.trim()
		const password = `${body?.password || ''}`.trim()

		if (state.adminAccount) {
			return json(res, 409, {
				message: 'El usuario administrador ya fue creado. Usa restablecer acceso.',
			})
		}

		if (!email || !username || !password) {
			return json(res, 400, { message: 'Email, usuario y contrasena son obligatorios.' })
		}

		if (!isValidEmail(email)) {
			return json(res, 400, { message: 'El email no es valido.' })
		}

		if (username.length < 4) {
			return json(res, 400, { message: 'El usuario debe tener al menos 4 caracteres.' })
		}

		if (password.length < 6) {
			return json(res, 400, { message: 'La contrasena debe tener al menos 6 caracteres.' })
		}

		state.adminAccount = { email, username, password }
		saveState(state)
		return json(res, 201, { message: 'Usuario administrador creado correctamente.' })
	}

	if (req.method === 'POST' && pathname === '/api/admin/reset') {
		const email = `${body?.email || ''}`.trim().toLowerCase()
		const username = `${body?.username || ''}`.trim()
		const password = `${body?.password || ''}`.trim()

		if (!state.adminAccount) {
			return json(res, 400, { message: 'Primero debes crear el usuario administrador.' })
		}

		if (!email || !username || !password) {
			return json(res, 400, { message: 'Email, usuario y contrasena son obligatorios.' })
		}

		if (email !== state.adminAccount.email) {
			return json(res, 401, { message: 'El email no coincide con el administrador registrado.' })
		}

		if (username.length < 4 || password.length < 6) {
			return json(res, 400, {
				message: 'Usuario minimo 4 caracteres y contrasena minimo 6.',
			})
		}

		state.adminAccount = { email: state.adminAccount.email, username, password }
		state.adminSessions.clear()
		saveState(state)
		return json(res, 200, { message: 'Acceso restablecido correctamente.' })
	}

	if (req.method === 'POST' && pathname === '/api/admin/clear') {
		const email = `${body?.email || ''}`.trim().toLowerCase()

		if (!state.adminAccount) {
			return json(res, 400, { message: 'No hay usuario administrador creado.' })
		}

		if (!email) {
			return json(res, 400, { message: 'El email es obligatorio.' })
		}

		if (email !== state.adminAccount.email) {
			return json(res, 401, { message: 'El email no coincide con el administrador registrado.' })
		}

		state.adminAccount = null
		state.adminSessions.clear()
		saveState(state)
		return json(res, 200, { message: 'Usuario administrador eliminado correctamente.' })
	}

	if (req.method === 'GET' && pathname === '/api/admin/doctors') {
		const auth = requireAdminAuth(req, state)
		if (!auth.ok) {
			return json(res, auth.status, { message: auth.message })
		}

		return json(res, 200, state.doctors)
	}

	if (req.method === 'POST' && pathname === '/api/admin/doctors') {
		const auth = requireAdminAuth(req, state)
		if (!auth.ok) {
			return json(res, auth.status, { message: auth.message })
		}

		const name = `${body?.name || ''}`.trim()
		const specialty = `${body?.specialty || ''}`.trim()
		const office = `${body?.office || ''}`.trim()

		if (!name || !specialty || !office) {
			return json(res, 400, {
				message: 'Nombre, especialidad y consultorio son obligatorios.',
			})
		}

		const doctor = { id: generateId(), name, specialty, office, schedule: [] }
		state.doctors.push(doctor)
		saveState(state)
		return json(res, 201, doctor)
	}

	if (req.method === 'PUT' && /^\/api\/admin\/doctors\/[^/]+\/schedule$/.test(pathname)) {
		const auth = requireAdminAuth(req, state)
		if (!auth.ok) {
			return json(res, auth.status, { message: auth.message })
		}

		const id = pathname.split('/')[4]
		const doctor = findDoctorById(state, id)
		if (!doctor) {
			return json(res, 404, { message: 'No se encontro el medico.' })
		}

		const normalized = normalizeSchedule(body?.schedule)
		if (!normalized) {
			return json(res, 400, { message: 'El horario enviado no es valido.' })
		}

		doctor.schedule = normalized
		saveState(state)
		return json(res, 200, doctor)
	}

	if (req.method === 'DELETE' && /^\/api\/admin\/doctors\/[^/]+$/.test(pathname)) {
		const auth = requireAdminAuth(req, state)
		if (!auth.ok) {
			return json(res, auth.status, { message: auth.message })
		}

		const id = pathname.split('/')[4]
		const doctorIndex = state.doctors.findIndex((doctor) => doctor.id === id)
		if (doctorIndex === -1) {
			return json(res, 404, { message: 'No se encontro el medico.' })
		}

		const hasLinkedAppointments = state.appointments.some(
			(appointment) => appointment.doctorId === id,
		)

		if (hasLinkedAppointments) {
			return json(res, 409, {
				message:
					'No se puede borrar el medico porque tiene turnos asociados. Cancela esos turnos primero.',
			})
		}

		state.doctors.splice(doctorIndex, 1)
		saveState(state)
		res.statusCode = 204
		res.end()
		return
	}

	if (req.method === 'GET' && pathname === '/api/appointments') {
		const auth = requireAdminAuth(req, state)
		if (!auth.ok) {
			return json(res, auth.status, { message: auth.message })
		}

		const response = state.appointments
			.map((appointment) => ({
				...appointment,
				doctor: findDoctorById(state, appointment.doctorId),
			}))
			.sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time))

		return json(res, 200, response)
	}

	if (req.method === 'POST' && pathname === '/api/appointments') {
		const patientName = `${body?.patientName || ''}`.trim()
		const patientPhone = `${body?.patientPhone || ''}`.trim()
		const doctorId = `${body?.doctorId || ''}`.trim()
		const date = `${body?.date || ''}`.trim()
		const time = `${body?.time || ''}`.trim()
		const notes = `${body?.notes || ''}`.trim()

		if (!patientName || !patientPhone || !doctorId || !date || !time) {
			return json(res, 400, { message: 'Faltan campos obligatorios.' })
		}

		const phoneRegex = /^\+?[0-9\s-]{8,20}$/
		if (!phoneRegex.test(patientPhone)) {
			return json(res, 400, { message: 'El numero de celular no es valido.' })
		}

		const doctor = findDoctorById(state, doctorId)
		if (!doctor) {
			return json(res, 404, { message: 'El medico seleccionado no existe.' })
		}

		const appointmentDate = parseDateTime(date, time)
		if (Number.isNaN(appointmentDate.getTime())) {
			return json(res, 400, { message: 'Fecha u hora invalidas.' })
		}

		if (appointmentDate.getTime() < Date.now()) {
			return json(res, 400, { message: 'No se pueden reservar turnos en el pasado.' })
		}

		const weekday = appointmentDate.getDay()
		const workingWindow = doctor.schedule.find((slot) => slot.day === weekday)
		if (!workingWindow) {
			return json(res, 400, { message: 'El medico no atiende ese dia.' })
		}

		const requestedMinutes = toMinutes(time)
		if (
			requestedMinutes < toMinutes(workingWindow.start) ||
			requestedMinutes >= toMinutes(workingWindow.end)
		) {
			return json(res, 400, {
				message: 'El horario esta fuera de la jornada configurada para ese medico.',
			})
		}

		if (hasConflict(state, doctorId, date, time)) {
			return json(res, 409, {
				message: 'Ese horario ya esta ocupado para el medico seleccionado.',
			})
		}

		const appointment = {
			id: generateId(),
			patientName,
			patientPhone,
			doctorId,
			date,
			time,
			notes,
			createdAt: new Date().toISOString(),
		}

		state.appointments.push(appointment)
		saveState(state)
		return json(res, 201, appointment)
	}

	if (req.method === 'DELETE' && /^\/api\/appointments\/[^/]+$/.test(pathname)) {
		const auth = requireAdminAuth(req, state)
		if (!auth.ok) {
			return json(res, auth.status, { message: auth.message })
		}

		const id = pathname.split('/')[3]
		const index = state.appointments.findIndex((appointment) => appointment.id === id)
		if (index === -1) {
			return json(res, 404, { message: 'No se encontro el turno.' })
		}

		state.appointments.splice(index, 1)
		saveState(state)
		res.statusCode = 204
		res.end()
		return
	}

	return json(res, 404, { message: 'Ruta no encontrada.' })
}
