import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import api from '../services/api'

const ADMIN_TOKEN_KEY = 'adminToken'
const DAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
]

function dayLabel(day) {
  return DAY_OPTIONS.find((option) => option.value === day)?.label || 'Dia'
}

function formatAppointmentDay(date, time) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
  const parsed = dayjs(`${date}T${time}`)
  return `${dayNames[parsed.day()]} ${parsed.format('DD/MM/YYYY')}`
}

function sanitizePhoneForWhatsApp(phone) {
  return `${phone || ''}`.replace(/\D/g, '')
}

function notifyAdminAuthChanged() {
  window.dispatchEvent(new Event('admin-auth-changed'))
}

function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  const [isAdminConfigured, setIsAdminConfigured] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    email: '',
    username: '',
    password: '',
  })
  const [resetForm, setResetForm] = useState({
    email: '',
    username: '',
    password: '',
  })
  const [clearForm, setClearForm] = useState({ email: '' })
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [showClearForm, setShowClearForm] = useState(false)
  const [appointments, setAppointments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [doctorForm, setDoctorForm] = useState({ name: '', specialty: '', office: '' })
  const [scheduleForm, setScheduleForm] = useState({
    doctorId: '',
    day: '1',
    start: '09:00',
    end: '13:00',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPrintForm, setShowPrintForm] = useState(false)
  const [printForm, setPrintForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    doctorId: 'all',
  })

  function authHeaders(activeToken) {
    return {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    }
  }

  function clearSessionWithError(message) {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    notifyAdminAuthChanged()
    setToken('')
    setAppointments([])
    setDoctors([])
    setError(message)
  }

  async function loadAdminStatus() {
    try {
      setStatusLoading(true)
      const response = await api.get('/api/admin/status')
      setIsAdminConfigured(Boolean(response.data.configured))
      if (response.data.configured) {
        setShowRegisterForm(false)
      }
    } catch (requestError) {
      setError('No se pudo verificar el estado del administrador.')
    } finally {
      setStatusLoading(false)
    }
  }

  async function loadAppointments(activeToken) {
    try {
      setLoading(true)
      const response = await api.get('/api/appointments', authHeaders(activeToken))
      setAppointments(response.data)
    } catch (requestError) {
      const status = requestError?.response?.status
      if (status === 401) {
        clearSessionWithError('Sesion expirada. Inicia sesion nuevamente.')
        return
      }

      const message =
        requestError?.response?.data?.message || 'No se pudieron cargar los turnos.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function loadDoctors(activeToken) {
    try {
      const response = await api.get('/api/admin/doctors', authHeaders(activeToken))
      setDoctors(response.data)

      if (response.data.length > 0) {
        setScheduleForm((prev) => ({
          ...prev,
          doctorId: prev.doctorId || response.data[0].id,
        }))
      }
    } catch (requestError) {
      const status = requestError?.response?.status
      if (status === 401) {
        clearSessionWithError('Sesion expirada. Inicia sesion nuevamente.')
        return
      }

      const message =
        requestError?.response?.data?.message || 'No se pudo cargar el listado de medicos.'
      setError(message)
    }
  }

  useEffect(() => {
    if (!token) {
      loadAdminStatus()
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      return
    }

    setError('')
    loadAppointments(token)
    loadDoctors(token)
  }, [token])

  function handleAuthChange(event) {
    const { name, value } = event.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleRegisterChange(event) {
    const { name, value } = event.target
    setRegisterForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleResetChange(event) {
    const { name, value } = event.target
    setResetForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleClearChange(event) {
    const { name, value } = event.target
    setClearForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    try {
      const response = await api.post('/api/admin/login', authForm)
      const nextToken = response.data.token
      localStorage.setItem(ADMIN_TOKEN_KEY, nextToken)
      notifyAdminAuthChanged()
      setToken(nextToken)
      setSuccess('Sesion iniciada.')
      setAuthForm({ username: '', password: '' })
    } catch (loginError) {
      const message =
        loginError?.response?.data?.message || 'No se pudo iniciar sesion.'
      setError(message)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    try {
      await api.post('/api/admin/register', registerForm)
      setSuccess('Usuario administrador creado. Ahora inicia sesion.')
      setIsAdminConfigured(true)
      setAuthForm({ username: registerForm.username, password: '' })
      setRegisterForm({ email: '', username: '', password: '' })
      setShowRegisterForm(false)
    } catch (registerError) {
      const message =
        registerError?.response?.data?.message ||
        'No se pudo crear el usuario administrador.'
      setError(message)
    }
  }

  async function handleResetCredentials(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    try {
      await api.post('/api/admin/reset', resetForm)
      setSuccess('Acceso restablecido. Inicia sesion con los nuevos datos.')
      setAuthForm({ username: resetForm.username, password: '' })
      setResetForm({ email: '', username: '', password: '' })
      setShowResetForm(false)
    } catch (generateError) {
      const message =
        generateError?.response?.data?.message ||
        'No se pudo restablecer el acceso.'
      setError(message)
    }
  }

  async function handleClearAdminAccount(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    try {
      await api.post('/api/admin/clear', clearForm)
      setSuccess('Usuario administrador eliminado. Ahora puedes crear uno nuevo.')
      setIsAdminConfigured(false)
      setShowClearForm(false)
      setShowResetForm(false)
      setClearForm({ email: '' })
      setAuthForm({ username: '', password: '' })
    } catch (clearError) {
      const message =
        clearError?.response?.data?.message ||
        'No se pudo borrar el usuario administrador.'
      setError(message)
    }
  }

  function handleDoctorFormChange(event) {
    const { name, value } = event.target
    setDoctorForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleCreateDoctor(event) {
    event.preventDefault()
    if (!token) {
      return
    }

    setError('')
    setSuccess('')

    try {
      const response = await api.post('/api/admin/doctors', doctorForm, authHeaders(token))
      const createdDoctor = response.data
      setDoctorForm({ name: '', specialty: '', office: '' })
      setScheduleForm((prev) => ({ ...prev, doctorId: createdDoctor.id }))
      setSuccess('Medico creado correctamente.')
      await loadDoctors(token)
    } catch (createError) {
      const message = createError?.response?.data?.message || 'No se pudo crear el medico.'
      setError(message)
    }
  }

  function handleScheduleFormChange(event) {
    const { name, value } = event.target
    setScheduleForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleAssignSchedule(event) {
    event.preventDefault()
    if (!token || !scheduleForm.doctorId) {
      return
    }

    if (scheduleForm.start >= scheduleForm.end) {
      setError('La hora de inicio debe ser menor a la hora de fin.')
      return
    }

    setError('')
    setSuccess('')

    const doctor = doctors.find((item) => item.id === scheduleForm.doctorId)
    if (!doctor) {
      setError('Selecciona un medico valido.')
      return
    }

    const dayNumber = Number(scheduleForm.day)
    const nextSchedule = (doctor.schedule || [])
      .filter((slot) => slot.day !== dayNumber)
      .concat({ day: dayNumber, start: scheduleForm.start, end: scheduleForm.end })

    try {
      await api.put(
        `/api/admin/doctors/${doctor.id}/schedule`,
        { schedule: nextSchedule },
        authHeaders(token),
      )
      setSuccess('Horario actualizado correctamente.')
      await loadDoctors(token)
    } catch (scheduleError) {
      const message =
        scheduleError?.response?.data?.message ||
        'No se pudo actualizar el horario del medico.'
      setError(message)
    }
  }

  async function handleRemoveSchedule(doctorId, day) {
    if (!token) {
      return
    }

    setError('')
    setSuccess('')

    const doctor = doctors.find((item) => item.id === doctorId)
    if (!doctor) {
      return
    }

    const nextSchedule = (doctor.schedule || []).filter((slot) => slot.day !== day)

    try {
      await api.put(
        `/api/admin/doctors/${doctor.id}/schedule`,
        { schedule: nextSchedule },
        authHeaders(token),
      )
      setSuccess('Horario eliminado correctamente.')
      await loadDoctors(token)
    } catch (removeError) {
      const message = removeError?.response?.data?.message || 'No se pudo eliminar ese horario.'
      setError(message)
    }
  }

  async function handleDeleteDoctor(doctorId) {
    if (!token) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await api.delete(`/api/admin/doctors/${doctorId}`, authHeaders(token))
      setSuccess('Medico eliminado correctamente.')
      await loadDoctors(token)
    } catch (deleteError) {
      const message =
        deleteError?.response?.data?.message || 'No se pudo borrar el medico.'
      setError(message)
    }
  }

  async function handleCancelAppointment(id) {
    if (!token) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await api.delete(`/api/appointments/${id}`, authHeaders(token))
      setAppointments((prev) => prev.filter((appointment) => appointment.id !== id))
      setSuccess('Turno cancelado correctamente.')
    } catch (cancelError) {
      const message =
        cancelError?.response?.data?.message ||
        'No se pudo cancelar el turno. Intentalo nuevamente.'
      setError(message)
    }
  }

  function handleConfirmByWhatsApp(appointment) {
    const doctorName = appointment.doctor?.name || 'el profesional'
    const dayText = formatAppointmentDay(appointment.date, appointment.time)
    const message = `Hola Queremos confirmar tu turno con ${doctorName}, el dia ${dayText}, a las ${appointment.time}.`
    const phone = sanitizePhoneForWhatsApp(appointment.patientPhone)

    if (!phone) {
      setError('El numero del paciente no es valido para WhatsApp.')
      return
    }

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    notifyAdminAuthChanged()
    setToken('')
    setAppointments([])
    setDoctors([])
    setSuccess('Sesion cerrada.')
    setError('')
  }

  function handlePrintFormChange(event) {
    const { name, value } = event.target
    setPrintForm((prev) => ({ ...prev, [name]: value }))
  }

  function getSortedAppointmentsForPrint() {
    const filtered = appointments.filter((appointment) => {
      if (appointment.date !== printForm.date) {
        return false
      }

      if (printForm.doctorId === 'all') {
        return true
      }

      return appointment.doctor?.id === printForm.doctorId
    })

    return filtered.sort((first, second) => {
      const firstDoctor = `${first.doctor?.name || ''}`
      const secondDoctor = `${second.doctor?.name || ''}`
      const doctorComparison = firstDoctor.localeCompare(secondDoctor, 'es', { sensitivity: 'base' })

      if (doctorComparison !== 0) {
        return doctorComparison
      }

      const firstDateTime = `${first.date}T${first.time}`
      const secondDateTime = `${second.date}T${second.time}`
      return firstDateTime.localeCompare(secondDateTime)
    })
  }

  function buildPrintHtml(sortedAppointments, selectedDoctorLabel) {
    const dateLabel = dayjs(printForm.date).format('DD/MM/YYYY')

    const rowsHtml = sortedAppointments
      .map(
        (appointment) => `
          <tr>
            <td>${appointment.doctor?.name || '-'}</td>
            <td>${appointment.doctor?.specialty || '-'}</td>
            <td>${appointment.time}</td>
            <td>${appointment.patientName}</td>
            <td>${appointment.patientPhone || '-'}</td>
          </tr>
        `,
      )
      .join('')

    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Turnos ${dateLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 2px 0; color: #334155; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 14px; }
            th { background: #f1f5f9; }
            .muted { color: #475569; font-size: 13px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <h1>Listado de turnos</h1>
          <p><strong>Fecha:</strong> ${dateLabel}</p>
          <p><strong>Medico:</strong> ${selectedDoctorLabel}</p>
          <table>
            <thead>
              <tr>
                <th>Medico</th>
                <th>Especialidad</th>
                <th>Horario</th>
                <th>Paciente</th>
                <th>Celular</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <p class="muted">Ordenado por medico y horario.</p>
        </body>
      </html>
    `
  }

  function handlePrintAppointments(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!printForm.date) {
      setError('Selecciona una fecha para imprimir los turnos.')
      return
    }

    const sortedAppointments = getSortedAppointmentsForPrint()
    if (sortedAppointments.length === 0) {
      setError('No hay turnos para esos filtros.')
      return
    }

    const selectedDoctorLabel =
      printForm.doctorId === 'all'
        ? 'Todos los medicos'
        : doctors.find((doctor) => doctor.id === printForm.doctorId)?.name || 'Medico'

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setError('No se pudo abrir la ventana de impresion. Revisa el bloqueador de popups.')
      return
    }

    printWindow.document.write(buildPrintHtml(sortedAppointments, selectedDoctorLabel))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()

    setSuccess('Listado listo para imprimir.')
    setShowPrintForm(false)
  }

  return (
    <main className="app-shell">
      <header className="hero admin-hero">
        <div>
          <p className="badge">Panel Seguro</p>
          <h1>Administracion</h1>
          <p className="subtitle">Solo administradores pueden ver y gestionar turnos.</p>
        </div>
      </header>

      <section className="grid-layout single-column">
        {!token && (
          <article className="panel">
            <h2>Ingreso de Administrador</h2>
            {statusLoading && <p className="info">Verificando configuracion...</p>}

            <form onSubmit={handleLogin} className="form-grid">
              <label>
                Usuario
                <input
                  type="text"
                  name="username"
                  value={authForm.username}
                  onChange={handleAuthChange}
                  required
                />
              </label>

              <label>
                Contrasena
                <input
                  type="password"
                  name="password"
                  value={authForm.password}
                  onChange={handleAuthChange}
                  required
                />
              </label>

              <button type="submit">Entrar</button>
            </form>

            {!isAdminConfigured && (
              <p className="info">
                Aun no hay administrador creado. Crea uno para poder ingresar.
              </p>
            )}

            <div className="form-section">
              {isAdminConfigured && (
                <>
                  {!showResetForm && (
                    <button type="button" onClick={() => setShowResetForm(true)}>
                      Restablecer acceso
                    </button>
                  )}

                  {showResetForm && (
                    <form onSubmit={handleResetCredentials} className="form-grid">
                      <h3>Restablecer usuario y contrasena</h3>
                      <label>
                        Email
                        <input
                          type="email"
                          name="email"
                          value={resetForm.email}
                          onChange={handleResetChange}
                          required
                        />
                      </label>
                      <label>
                        Nuevo usuario
                        <input
                          type="text"
                          name="username"
                          value={resetForm.username}
                          onChange={handleResetChange}
                          required
                          minLength={4}
                        />
                      </label>
                      <label>
                        Nueva contrasena
                        <input
                          type="password"
                          name="password"
                          value={resetForm.password}
                          onChange={handleResetChange}
                          required
                          minLength={6}
                        />
                      </label>

                      <div className="admin-actions">
                        <button type="submit">Guardar cambios</button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => setShowResetForm(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>

            {isAdminConfigured && (
              <div className="form-section">
                {!showClearForm && (
                  <button type="button" className="danger" onClick={() => setShowClearForm(true)}>
                    Borrar usuario de administracion
                  </button>
                )}

                {showClearForm && (
                  <form onSubmit={handleClearAdminAccount} className="form-grid">
                    <h3>Eliminar administrador</h3>
                    <label>
                      Email registrado
                      <input
                        type="email"
                        name="email"
                        value={clearForm.email}
                        onChange={handleClearChange}
                        required
                      />
                    </label>

                    <div className="admin-actions">
                      <button type="submit" className="danger">Confirmar borrado</button>
                      <button
                        type="button"
                        onClick={() => setShowClearForm(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {!statusLoading && !isAdminConfigured && (
              <div className="form-section">
                {!showRegisterForm && (
                  <button type="button" onClick={() => setShowRegisterForm(true)}>
                    Crear usuario y contrasena
                  </button>
                )}

                {showRegisterForm && (
                  <form onSubmit={handleRegister} className="form-grid">
                    <h3>Crear administrador</h3>
                    <label>
                      Email
                      <input
                        type="email"
                        name="email"
                        value={registerForm.email}
                        onChange={handleRegisterChange}
                        required
                      />
                    </label>

                    <label>
                      Usuario
                      <input
                        type="text"
                        name="username"
                        value={registerForm.username}
                        onChange={handleRegisterChange}
                        required
                        minLength={4}
                      />
                    </label>

                    <label>
                      Contrasena
                      <input
                        type="password"
                        name="password"
                        value={registerForm.password}
                        onChange={handleRegisterChange}
                        required
                        minLength={6}
                      />
                    </label>

                    <div className="admin-actions">
                      <button type="submit">Guardar usuario</button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setShowRegisterForm(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </article>
        )}

        {token && (
          <>
            <article className="panel">
              <div className="admin-header-row">
                <h2>Turnos Agendados</h2>
                <button
                  type="button"
                  className="print-btn"
                  onClick={() => setShowPrintForm((prev) => !prev)}
                >
                  Imprimir turnos
                </button>
              </div>

              {showPrintForm && (
                <form onSubmit={handlePrintAppointments} className="print-form">
                  <div className="inline-fields print-fields">
                    <label>
                      Dia a imprimir
                      <input
                        type="date"
                        name="date"
                        value={printForm.date}
                        onChange={handlePrintFormChange}
                        required
                      />
                    </label>

                    <label>
                      Medico
                      <select
                        name="doctorId"
                        value={printForm.doctorId}
                        onChange={handlePrintFormChange}
                      >
                        <option value="all">Todos</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="admin-actions">
                    <button type="submit">Imprimir</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setShowPrintForm(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {loading && <p className="info">Cargando turnos...</p>}

              {!loading && appointments.length === 0 && (
                <p className="info">No hay turnos cargados.</p>
              )}

              <ul className="appointment-list">
                {appointments.map((appointment) => (
                  <li key={appointment.id}>
                    <div className="appointment-content">
                      <p className="patient">{appointment.patientName}</p>
                      <p className="doctor-highlight">
                        {appointment.doctor?.name} ({appointment.doctor?.specialty})
                      </p>
                      <p className="meta">
                        <span className="meta-label">Celular: </span>
                        <span className="meta-value">{appointment.patientPhone}</span>
                      </p>
                      <p className="meta">
                        <span className="meta-label">Dia y hora: </span>
                        <span className="meta-value">
                          {dayjs(`${appointment.date}T${appointment.time}`).format(
                            'DD/MM/YYYY HH:mm',
                          )}
                        </span>
                      </p>
                      {appointment.notes && (
                        <p className="notes">Observaciones: {appointment.notes}</p>
                      )}
                    </div>
                    <div className="appointment-actions">
                      <button
                        type="button"
                        className="whatsapp-btn"
                        onClick={() => handleConfirmByWhatsApp(appointment)}
                      >
                        <svg
                          className="whatsapp-icon"
                          viewBox="0 0 24 24"
                          role="presentation"
                          aria-hidden="true"
                        >
                          <path
                            fill="currentColor"
                            d="M12 2a10 10 0 0 0-8.75 14.84L2 22l5.3-1.23A10 10 0 1 0 12 2zm5.57 14.16c-.24.68-1.38 1.27-1.9 1.35-.49.07-1.12.1-1.81-.12-.42-.14-.96-.31-1.66-.6-2.93-1.27-4.84-4.23-4.99-4.43-.15-.2-1.19-1.58-1.19-3.02 0-1.43.75-2.13 1.02-2.42.27-.3.59-.37.79-.37.2 0 .4 0 .57.01.19.01.44-.07.69.53.24.58.83 2 .9 2.14.07.14.12.3.02.49-.1.2-.15.31-.3.47-.15.17-.31.37-.44.5-.15.14-.3.3-.13.58.17.28.77 1.26 1.65 2.04 1.14 1.01 2.1 1.32 2.4 1.47.3.15.48.12.66-.07.17-.2.74-.87.94-1.17.2-.3.4-.25.68-.15.28.1 1.75.83 2.05.98.3.15.5.22.57.35.07.13.07.75-.17 1.43z"
                          />
                        </svg>
                        Confirmar turno
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleCancelAppointment(appointment.id)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2>Gestion de Medicos</h2>

              <form onSubmit={handleCreateDoctor} className="form-grid form-section">
                <h3>Crear medico</h3>
                <div className="inline-fields three-columns">
                  <label>
                    Nombre
                    <input
                      type="text"
                      name="name"
                      value={doctorForm.name}
                      onChange={handleDoctorFormChange}
                      required
                    />
                  </label>
                  <label>
                    Especialidad
                    <input
                      type="text"
                      name="specialty"
                      value={doctorForm.specialty}
                      onChange={handleDoctorFormChange}
                      required
                    />
                  </label>
                  <label>
                    Consultorio
                    <input
                      type="text"
                      name="office"
                      value={doctorForm.office}
                      onChange={handleDoctorFormChange}
                      required
                    />
                  </label>
                </div>
                <button type="submit">Guardar medico</button>
              </form>

              <form onSubmit={handleAssignSchedule} className="form-grid form-section">
                <h3>Asignar dias y horarios</h3>
                <div className="inline-fields four-columns">
                  <label>
                    Medico
                    <select
                      name="doctorId"
                      value={scheduleForm.doctorId}
                      onChange={handleScheduleFormChange}
                      required
                    >
                      <option value="" disabled>
                        Seleccionar medico
                      </option>
                      {doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Dia
                    <select
                      name="day"
                      value={scheduleForm.day}
                      onChange={handleScheduleFormChange}
                    >
                      {DAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Desde
                    <input
                      type="time"
                      name="start"
                      value={scheduleForm.start}
                      onChange={handleScheduleFormChange}
                      required
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="time"
                      name="end"
                      value={scheduleForm.end}
                      onChange={handleScheduleFormChange}
                      required
                    />
                  </label>
                </div>
                <button type="submit">Guardar horario</button>
              </form>

              <div className="doctor-grid">
                {doctors.map((doctor) => (
                  <article key={doctor.id} className="doctor-card">
                    <div className="doctor-card-head">
                      <h4>{doctor.name}</h4>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleDeleteDoctor(doctor.id)}
                      >
                        Borrar medico
                      </button>
                    </div>
                    <p className="meta">{doctor.specialty}</p>
                    <p className="meta">{doctor.office}</p>

                    {doctor.schedule?.length ? (
                      <ul className="schedule-list">
                        {doctor.schedule.map((slot) => (
                          <li key={`${doctor.id}-${slot.day}`}>
                            <span>
                              {dayLabel(slot.day)}: {slot.start} a {slot.end}
                            </span>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleRemoveSchedule(doctor.id, slot.day)}
                            >
                              Quitar
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="info">Sin horarios asignados.</p>
                    )}
                  </article>
                ))}
              </div>
            </article>
          </>
        )}

        {error && <p className="message error">{error}</p>}
        {success && <p className="message success">{success}</p>}
      </section>
    </main>
  )
}

export default AdminPage
