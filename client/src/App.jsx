import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import BookingPage from './pages/BookingPage'
import AdminPage from './pages/AdminPage'

function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

  return (
    <>
      <nav className="top-nav">
        {isAdminRoute ? (
          <>
            <Link to="/reservas">Reservas</Link>
            <span className="active">Administracion</span>
          </>
        ) : (
          <span className="active">Reservas</span>
        )}
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
