import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import BookingPage from './pages/BookingPage'
import AdminPage from './pages/AdminPage'

function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isBookingRoute = location.pathname.startsWith('/reservas')

  return (
    <>
      <nav className="top-nav">
        {isBookingRoute ? (
          <>
            <span className="active">Reservas</span>
            <Link to="/admin">Administracion</Link>
          </>
        ) : null}

        {isAdminRoute ? (
          <>
            <Link to="/reservas">Reservas</Link>
            <span className="active">Administracion</span>
          </>
        ) : null}
      </nav>

      <Routes>
        <Route path="/reservas" element={<BookingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/reservas" replace />} />
      </Routes>
    </>
  )
}

export default App
