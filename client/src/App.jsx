import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import BookingPage from './pages/BookingPage'
import AdminPage from './pages/AdminPage'

const ADMIN_TOKEN_KEY = 'adminToken'

function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isBookingRoute = location.pathname.startsWith('/reservas')
  const [hasAdminToken, setHasAdminToken] = useState(Boolean(localStorage.getItem(ADMIN_TOKEN_KEY)))

  useEffect(() => {
    function syncAuthState() {
      setHasAdminToken(Boolean(localStorage.getItem(ADMIN_TOKEN_KEY)))
    }

    window.addEventListener('storage', syncAuthState)
    window.addEventListener('admin-auth-changed', syncAuthState)

    return () => {
      window.removeEventListener('storage', syncAuthState)
      window.removeEventListener('admin-auth-changed', syncAuthState)
    }
  }, [])

  function handleGlobalLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    setHasAdminToken(false)
    window.dispatchEvent(new Event('admin-auth-changed'))
  }

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

        {hasAdminToken ? (
          <button type="button" className="nav-logout" onClick={handleGlobalLogout}>
            Cerrar sesion
          </button>
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
