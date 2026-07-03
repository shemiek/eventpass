import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import Navbar from './components/Navbar'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EventForm from './pages/EventForm'
import EventDetail from './pages/EventDetail'
import ScanCheckIn from './pages/ScanCheckIn'
import PublicRegister from './pages/PublicRegister'
import RegistrationSuccess from './pages/RegistrationSuccess'

function Protected({ user, loading, children }) {
  if (loading) return <div className="p-8 text-center text-mist">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <Navbar user={user} />
      <main className="flex-1">
        <Routes>
          {/* Public attendee-facing routes */}
          <Route path="/e/:slug" element={<PublicRegister />} />
          <Route path="/ticket/:code" element={<RegistrationSuccess />} />

          {/* Organizer/staff auth */}
          <Route path="/login" element={<Login />} />

          {/* Organizer/staff dashboard (protected) */}
          <Route
            path="/dashboard"
            element={<Protected user={user} loading={loading}><Dashboard /></Protected>}
          />
          <Route
            path="/events/new"
            element={<Protected user={user} loading={loading}><EventForm /></Protected>}
          />
          <Route
            path="/events/:id/edit"
            element={<Protected user={user} loading={loading}><EventForm /></Protected>}
          />
          <Route
            path="/events/:id"
            element={<Protected user={user} loading={loading}><EventDetail /></Protected>}
          />
          <Route
            path="/events/:id/scan"
            element={<Protected user={user} loading={loading}><ScanCheckIn /></Protected>}
          />

          <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
          <Route path="*" element={<div className="p-8 text-center">Page not found.</div>} />
        </Routes>
      </main>
    </div>
  )
}
