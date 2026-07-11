require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')

const app = express()
const port = process.env.PORT || 4000
const dataDirPath = path.join(__dirname, 'data')
const dataFilePath = path.join(dataDirPath, 'store.json')
let adminAccount = null
if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && process.env.ADMIN_EMAIL) {
  adminAccount = {
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD,
    email: process.env.ADMIN_EMAIL,
  }
}
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8
const adminSessions = new Map()

app.use(cors())
app.use(express.json())

const clientDistPath = path.join(__dirname, '..', 'client', 'dist')
const hasClientBuild = fs.existsSync(clientDistPath)

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

let doctors = structuredClone(defaultDoctors)

let appointments = []

function saveStore() {
  try {
    if (!fs.existsSync(dataDirPath)) {
      fs.mkdirSync(dataDirPath, { recursive: true })
    }

    const payload = {
      adminAccount,
      doctors,
      appointments,
      updatedAt: new Date().toISOString(),
    }

    fs.writeFileSync(dataFilePath, JSON.stringify(payload, null, 2), 'utf8')
  } catch (error) {
    console.error('No se pudo guardar store.json:', error.message)
  }
}

function loadStore() {
  if (!fs.existsSync(dataFilePath)) {
    return false
  }

  try {
    const rawContent = fs.readFileSync(dataFilePath, 'utf8')
    const parsed = JSON.parse(rawContent)

    adminAccount = parsed?.adminAccount || null
    doctors = Array.isArray(parsed?.doctors)
      ? parsed.doctors
      : structuredClone(defaultDoctors)
    appointments = Array.isArray(parsed?.appointments) ? parsed.appointments : []

    return true
  } catch (error) {
    console.error('No se pudo cargar store.json:', error.message)
    return false
  }
}

const hasStoreData = loadStore()
if (!hasStoreData) {
  saveStore()
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

function findDoctorById(doctorId) {
  return doctors.find((doctor) => doctor.id === doctorId)
}

function hasConflict(doctorId, date, time, ignoreId = null) {
  return appointments.some((appointment) => {
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

function createAdminSession() {
  const token = uuidv4()
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS
  adminSessions.set(token, expiresAt)
  return { token, expiresAt }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null

  if (!token) {
    return res.status(401).json({
      message: 'No autorizado.',
    })
  }

  const expiresAt = adminSessions.get(token)
  if (!expiresAt || expiresAt < Date.now()) {
    if (expiresAt) {
      adminSessions.delete(token)
    }

    return res.status(401).json({
      message: 'Sesion invalida o expirada.',
    })
  }

  next()
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true })
})

app.get('/api/doctors', (_, res) => {
  res.json(doctors)
})

app.get('/api/appointments/availability', (req, res) => {
  const { doctorId, date } = req.query

  if (!doctorId || !date) {
    return res.status(400).json({
      message: 'doctorId y date son obligatorios.',
    })
  }

  const doctor = findDoctorById(`${doctorId}`)
  if (!doctor) {
    return res.status(404).json({
      message: 'El medico seleccionado no existe.',
    })
  }

  const occupiedTimes = appointments
    .filter(
      (appointment) =>
        appointment.doctorId === `${doctorId}` && appointment.date === `${date}`,
    )
    .map((appointment) => appointment.time)
    .sort((a, b) => toMinutes(a) - toMinutes(b))

  return res.status(200).json({ occupiedTimes })
})

app.get('/api/admin/doctors', requireAdminAuth, (_, res) => {
  res.json(doctors)
})

app.post('/api/admin/doctors', requireAdminAuth, (req, res) => {
  const { name, specialty, office } = req.body

  if (!name || !specialty || !office) {
    return res.status(400).json({
      message: 'Nombre, especialidad y consultorio son obligatorios.',
    })
  }

  const newDoctor = {
    id: uuidv4(),
    name: `${name}`.trim(),
    specialty: `${specialty}`.trim(),
    office: `${office}`.trim(),
    schedule: [],
  }

  doctors.push(newDoctor)
  saveStore()
  return res.status(201).json(newDoctor)
})

app.put('/api/admin/doctors/:id/schedule', requireAdminAuth, (req, res) => {
  const { id } = req.params
  const doctor = findDoctorById(id)

  if (!doctor) {
    return res.status(404).json({
      message: 'No se encontro el medico.',
    })
  }

  const normalized = normalizeSchedule(req.body?.schedule)
  if (!normalized) {
    return res.status(400).json({
      message: 'El horario enviado no es valido.',
    })
  }

  doctor.schedule = normalized
  saveStore()
  return res.status(200).json(doctor)
})

app.delete('/api/admin/doctors/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params
  const doctorIndex = doctors.findIndex((doctor) => doctor.id === id)

  if (doctorIndex === -1) {
    return res.status(404).json({
      message: 'No se encontro el medico.',
    })
  }

  const hasLinkedAppointments = appointments.some(
    (appointment) => appointment.doctorId === id,
  )

  if (hasLinkedAppointments) {
    return res.status(409).json({
      message:
        'No se puede borrar el medico porque tiene turnos asociados. Cancela esos turnos primero.',
    })
  }

  doctors.splice(doctorIndex, 1)
  saveStore()
  return res.status(204).send()
})

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body

  if (!adminAccount) {
    return res.status(400).json({
      message: 'Primero debes crear el usuario administrador.',
    })
  }

  if (username !== adminAccount.username || password !== adminAccount.password) {
    return res.status(401).json({
      message: 'Credenciales invalidas.',
    })
  }

  const session = createAdminSession()
  return res.status(200).json(session)
})

app.get('/api/admin/status', (_, res) => {
  res.status(200).json({
    configured: Boolean(adminAccount),
  })
})

app.post('/api/admin/register', (req, res) => {
  const { email, username, password } = req.body

  if (adminAccount) {
    return res.status(409).json({
      message: 'El usuario administrador ya fue creado. Usa restablecer acceso.',
    })
  }

  if (!email || !username || !password) {
    return res.status(400).json({
      message: 'Email, usuario y contrasena son obligatorios.',
    })
  }

  const normalizedEmail = `${email}`.trim().toLowerCase()
  const normalizedUsername = `${username}`.trim()
  const normalizedPassword = `${password}`.trim()

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      message: 'El email no es valido.',
    })
  }

  if (normalizedUsername.length < 4) {
    return res.status(400).json({
      message: 'El usuario debe tener al menos 4 caracteres.',
    })
  }

  if (normalizedPassword.length < 6) {
    return res.status(400).json({
      message: 'La contrasena debe tener al menos 6 caracteres.',
    })
  }

  adminAccount = {
    email: normalizedEmail,
    username: normalizedUsername,
    password: normalizedPassword,
  }

  saveStore()

  return res.status(201).json({
    message: 'Usuario administrador creado correctamente.',
  })
})

app.post('/api/admin/reset', (req, res) => {
  const { email, username, password } = req.body

  if (!adminAccount) {
    return res.status(400).json({
      message: 'Primero debes crear el usuario administrador.',
    })
  }

  if (!email || !username || !password) {
    return res.status(400).json({
      message: 'Email, usuario y contrasena son obligatorios.',
    })
  }

  const normalizedEmail = `${email}`.trim().toLowerCase()
  const normalizedUsername = `${username}`.trim()
  const normalizedPassword = `${password}`.trim()

  if (normalizedEmail !== adminAccount.email) {
    return res.status(401).json({
      message: 'El email no coincide con el administrador registrado.',
    })
  }

  if (normalizedUsername.length < 4 || normalizedPassword.length < 6) {
    return res.status(400).json({
      message: 'Usuario minimo 4 caracteres y contrasena minimo 6.',
    })
  }

  adminAccount = {
    email: adminAccount.email,
    username: normalizedUsername,
    password: normalizedPassword,
  }

  adminSessions.clear()
  saveStore()

  return res.status(200).json({
    message: 'Acceso restablecido correctamente.',
  })
})

app.post('/api/admin/clear', (req, res) => {
  const { email } = req.body

  if (!adminAccount) {
    return res.status(400).json({
      message: 'No hay usuario administrador creado.',
    })
  }

  if (!email) {
    return res.status(400).json({
      message: 'El email es obligatorio.',
    })
  }

  const normalizedEmail = `${email}`.trim().toLowerCase()
  if (normalizedEmail !== adminAccount.email) {
    return res.status(401).json({
      message: 'El email no coincide con el administrador registrado.',
    })
  }

  adminAccount = null
  adminSessions.clear()
  saveStore()

  return res.status(200).json({
    message: 'Usuario administrador eliminado correctamente.',
  })
})

app.get('/api/appointments', requireAdminAuth, (_, res) => {
  const response = appointments
    .map((appointment) => {
      const doctor = findDoctorById(appointment.doctorId)

      return {
        ...appointment,
        doctor,
      }
    })
    .sort((a, b) => {
      const dateA = parseDateTime(a.date, a.time).getTime()
      const dateB = parseDateTime(b.date, b.time).getTime()

      return dateA - dateB
    })

  res.json(response)
})

app.post('/api/appointments', (req, res) => {
  const { patientName, patientPhone, doctorId, date, time, notes } = req.body

  if (!patientName || !patientPhone || !doctorId || !date || !time) {
    return res.status(400).json({
      message: 'Faltan campos obligatorios.',
    })
  }

  const phoneRegex = /^\+?[0-9\s-]{8,20}$/
  if (!phoneRegex.test(patientPhone.trim())) {
    return res.status(400).json({
      message: 'El numero de celular no es valido.',
    })
  }

  const doctor = findDoctorById(doctorId)
  if (!doctor) {
    return res.status(404).json({
      message: 'El medico seleccionado no existe.',
    })
  }

  const appointmentDate = parseDateTime(date, time)
  if (Number.isNaN(appointmentDate.getTime())) {
    return res.status(400).json({
      message: 'Fecha u hora invalidas.',
    })
  }

  if (appointmentDate.getTime() < Date.now()) {
    return res.status(400).json({
      message: 'No se pueden reservar turnos en el pasado.',
    })
  }

  const weekday = appointmentDate.getDay()
  const workingWindow = doctor.schedule.find((slot) => slot.day === weekday)
  if (!workingWindow) {
    return res.status(400).json({
      message: 'El medico no atiende ese dia.',
    })
  }

  const requestedMinutes = toMinutes(time)
  if (
    requestedMinutes < toMinutes(workingWindow.start) ||
    requestedMinutes >= toMinutes(workingWindow.end)
  ) {
    return res.status(400).json({
      message: 'El horario esta fuera de la jornada configurada para ese medico.',
    })
  }

  if (hasConflict(doctorId, date, time)) {
    return res.status(409).json({
      message: 'Ese horario ya esta ocupado para el medico seleccionado.',
    })
  }

  const appointment = {
    id: uuidv4(),
    patientName: patientName.trim(),
    patientPhone: patientPhone.trim(),
    doctorId,
    date,
    time,
    notes: notes?.trim() || '',
    createdAt: new Date().toISOString(),
  }

  appointments.push(appointment)
  saveStore()

  return res.status(201).json(appointment)
})

app.delete('/api/appointments/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params
  const index = appointments.findIndex((appointment) => appointment.id === id)

  if (index === -1) {
    return res.status(404).json({
      message: 'No se encontro el turno.',
    })
  }

  appointments.splice(index, 1)
  saveStore()
  return res.status(204).send()
})

if (hasClientBuild) {
  app.use(express.static(clientDistPath))

  app.get(/^(?!\/api).*/, (_, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'))
  })
} else {
  app.get('/', (_, res) => {
    res.status(200).send('API activa. Inicia el frontend con: cd client && npm run dev')
  })
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`API de turnos escuchando en http://localhost:${port}`)
  })
}

module.exports = app
