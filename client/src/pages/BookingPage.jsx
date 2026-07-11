import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import api from '../services/api'

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

function toMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function toTime(minutes) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
}

function generateDateOptions(schedule, daysAhead = 45) {
  const options = []

  for (let index = 0; index <= daysAhead; index += 1) {
    const date = dayjs().add(index, 'day')
    const dayNumber = date.day()
    const slot = schedule.find((item) => item.day === dayNumber)

    if (!slot) {
      continue
    }

    options.push({
      value: date.format('YYYY-MM-DD'),
      label: `${DAY_LABELS[dayNumber]} ${date.format('DD/MM/YYYY')}`,
    })
  }

  return options
}

function generateTimeOptions(slot, interval = 30) {
  if (!slot) {
    return []
  }

  const startMinutes = toMinutes(slot.start)
  const endMinutes = toMinutes(slot.end)
  const options = []

  for (let current = startMinutes; current < endMinutes; current += interval) {
    options.push(toTime(current))
  }

  return options
}

function BookingPage() {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityVersion, setAvailabilityVersion] = useState(0)
  const [occupiedTimes, setOccupiedTimes] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    doctorId: '',
    date: '',
    time: '',
    notes: '',
  })
  const today = dayjs().format('YYYY-MM-DD')

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === formData.doctorId),
    [doctors, formData.doctorId],
  )

  const dateOptions = useMemo(
    () => generateDateOptions(selectedDoctor?.schedule || []),
    [selectedDoctor],
  )

  const selectedDateSlot = useMemo(() => {
    if (!selectedDoctor || !formData.date) {
      return null
    }

    const weekday = dayjs(formData.date).day()
    return selectedDoctor.schedule?.find((slot) => slot.day === weekday) || null
  }, [selectedDoctor, formData.date])

  const timeOptions = useMemo(
    () => generateTimeOptions(selectedDateSlot),
    [selectedDateSlot],
  )

  const availableTimeOptions = useMemo(
    () => timeOptions.filter((time) => !occupiedTimes.includes(time)),
    [timeOptions, occupiedTimes],
  )

  useEffect(() => {
    async function loadDoctors() {
      try {
        setLoading(true)
        const doctorsResponse = await api.get('/api/doctors')
        setDoctors(doctorsResponse.data)

        if (doctorsResponse.data.length > 0) {
          setFormData((prev) => ({ ...prev, doctorId: doctorsResponse.data[0].id }))
        }
      } catch (loadError) {
        setError('No se pudieron cargar los medicos.')
        console.error(loadError)
      } finally {
        setLoading(false)
      }
    }

    loadDoctors()
  }, [])

  useEffect(() => {
    if (!selectedDoctor) {
      return
    }

    const fallbackDate = dateOptions[0]?.value || ''
    const nextDate = dateOptions.some((item) => item.value === formData.date)
      ? formData.date
      : fallbackDate

    const slot = nextDate
      ? selectedDoctor.schedule?.find((item) => item.day === dayjs(nextDate).day())
      : null
    const nextTimeOptions = generateTimeOptions(slot)
    const nextTime = nextTimeOptions.includes(formData.time)
      ? formData.time
      : nextTimeOptions[0] || ''

    if (nextDate !== formData.date || nextTime !== formData.time) {
      setFormData((prev) => ({
        ...prev,
        date: nextDate,
        time: nextTime,
      }))
    }
  }, [selectedDoctor, dateOptions, formData.date, formData.time])

  useEffect(() => {
    if (!formData.doctorId || !formData.date) {
      setOccupiedTimes([])
      return
    }

    let cancelled = false

    async function loadAvailability() {
      try {
        setAvailabilityLoading(true)
        const response = await api.get('/api/appointments/availability', {
          params: {
            doctorId: formData.doctorId,
            date: formData.date,
          },
        })

        if (!cancelled) {
          setOccupiedTimes(response.data.occupiedTimes || [])
        }
      } catch (requestError) {
        if (!cancelled) {
          setOccupiedTimes([])
        }
      } finally {
        if (!cancelled) {
          setAvailabilityLoading(false)
        }
      }
    }

    loadAvailability()

    return () => {
      cancelled = true
    }
  }, [formData.doctorId, formData.date, availabilityVersion])

  useEffect(() => {
    if (!formData.time) {
      return
    }

    if (!availableTimeOptions.includes(formData.time)) {
      setFormData((prev) => ({
        ...prev,
        time: availableTimeOptions[0] || '',
      }))
    }
  }, [availableTimeOptions, formData.time])

  function handleChange(event) {
    const { name, value } = event.target

    if (name === 'date' && value < today) {
      setError('No se pueden seleccionar fechas pasadas.')
      return
    }

    if (name === 'date') {
      setError('')
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.date || formData.date < today) {
      setError('No se pueden reservar turnos en fechas pasadas.')
      return
    }

    try {
      setSubmitting(true)
      await api.post('/api/appointments', formData)
      setSuccess('Turno reservado correctamente.')
      setFormData((prev) => ({
        ...prev,
        patientName: '',
        patientPhone: '',
        notes: '',
      }))
      setAvailabilityVersion((prev) => prev + 1)
    } catch (submitError) {
      const message =
        submitError?.response?.data?.message ||
        'No se pudo reservar el turno. Intentalo nuevamente.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="badge">Sistema Web</p>
          <h1>Reserva de Turnos</h1>
          <p className="subtitle">
            Completa el formulario para agendar tu turno con el medico disponible.
          </p>
        </div>
      </header>

      <section className="grid-layout single-column">
        <article className="panel">
          <h2>Reservar Turno</h2>

          {loading && <p className="info">Cargando datos...</p>}

          {!loading && (
            <form onSubmit={handleSubmit} className="form-grid">
              <label>
                Nombre del paciente
                <input
                  type="text"
                  name="patientName"
                  value={formData.patientName}
                  onChange={handleChange}
                  required
                  placeholder="Ej: Juan Perez"
                />
              </label>

              <label>
                Celular del paciente
                <input
                  type="tel"
                  name="patientPhone"
                  value={formData.patientPhone}
                  onChange={handleChange}
                  required
                  placeholder="Ej: +54 11 5555 5555"
                />
              </label>

              <label>
                Medico
                <select
                  name="doctorId"
                  value={formData.doctorId}
                  onChange={handleChange}
                  required
                >
                  <option value="" disabled>
                    Seleccionar medico
                  </option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} - {doctor.specialty}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-fields">
                <label>
                  Fecha
                  <select
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                    disabled={!dateOptions.length}
                  >
                    {!dateOptions.length && <option value="">Sin dias disponibles</option>}
                    {dateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Hora
                  <select
                    name="time"
                    value={formData.time}
                    onChange={handleChange}
                    required
                    disabled={!availableTimeOptions.length}
                  >
                    {!availableTimeOptions.length && <option value="">Sin horarios</option>}
                    {availableTimeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {availabilityLoading && (
                <p className="info">Actualizando horarios disponibles...</p>
              )}

              {!availabilityLoading && timeOptions.length > 0 && availableTimeOptions.length === 0 && (
                <p className="info">Ese dia ya no tiene horarios disponibles para este medico.</p>
              )}

              <label>
                Observaciones
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Motivo de consulta, alergias, etc."
                />
              </label>

              <button
                type="submit"
                disabled={
                  submitting ||
                  !dateOptions.length ||
                  !availableTimeOptions.length ||
                  availabilityLoading
                }
              >
                {submitting ? 'Guardando...' : 'Confirmar turno'}
              </button>
            </form>
          )}

          {error && <p className="message error">{error}</p>}
          {success && <p className="message success">{success}</p>}
        </article>
      </section>
    </main>
  )
}

export default BookingPage
