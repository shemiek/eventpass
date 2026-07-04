import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Navbar({ user }) {
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <header className="bg-navy text-paper">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="font-display font-semibold text-lg tracking-tight flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gold inline-block" />
          EventoPass
        </Link>
        {user && (
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/dashboard" className="hover:text-gold transition-colors">Events</Link>
            <button onClick={signOut} className="hover:text-gold transition-colors">Sign out</button>
          </nav>
        )}
      </div>
    </header>
  )
}
