import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import { configError } from './lib/supabaseClient'
import Navbar from './components/Navbar'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EventForm from './pages/EventForm'
import EventDetail from './pages/EventDetail'
import ScanCheckIn from './pages/ScanCheckIn'
import SessionScan from './pages/SessionScan'
import PublicRegister from './pages/PublicRegister'
import RegistrationSuccess from './pages/RegistrationSuccess'

function Protected({ user, loading, children }) {
  if (loading) return <div className="p-8 text-center text-mist">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const isLandingPage = location.pathname === '/' && !user && !loading

  if (configError) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="max-w-md bg-white border border-red-200 rounded-xl p-6">
          <p className="font-display text-lg font-semibold text-ink mb-2">Configuration error</p>
          <p className="text-sm text-ink/80">{configError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {!isLandingPage && <Navbar user={user} />}
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
          <Route
            path="/events/:id/sessions/:sessionId/scan"
            element={<Protected user={user} loading={loading}><SessionScan /></Protected>}
          />

          <Route path="/" element={loading ? <div className="p-8 text-center text-mist">Loading…</div> : user ? <Navigate to="/dashboard" replace /> : <Landing />} />
          <Route path="*" element={<div className="p-8 text-center">Page not found.</div>} />
        </Routes>
      </main>
    </div>
  )
}
