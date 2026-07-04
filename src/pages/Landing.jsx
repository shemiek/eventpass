import { Link } from 'react-router-dom'
import { QrCode, LayoutDashboard, Users, Ticket, MapPin, Download, ShieldCheck, CalendarClock } from 'lucide-react'

const FEATURES = [
  { icon: QrCode, title: 'QR badges & check-in', desc: "Attendees get a badge with a unique QR code the moment they register. Staff scan it with any phone camera — no scanner hardware." },
  { icon: Ticket, title: 'Ticket tiers & sessions', desc: 'Set up General, VIP, or any tier with its own capacity and price. Build a multi-session agenda attendees pick from at registration.' },
  { icon: LayoutDashboard, title: 'Live occupancy dashboard', desc: 'See who\'s currently inside, broken down by gate, in real time — plus registration trends and ticket tier breakdowns.' },
  { icon: Users, title: 'Role-based team access', desc: 'Invite managers and scanners per event by email. Everyone sees only the events they\'re actually part of.' },
  { icon: ShieldCheck, title: 'Approval workflows', desc: "Turn on approval for an event and badges stay locked until you review and approve each registration." },
  { icon: MapPin, title: 'Maps, deadlines & capacity', desc: 'Add a location preview, a registration deadline, and an overall capacity cap — registration closes itself automatically.' },
  { icon: CalendarClock, title: 'Walk-ins & bulk import', desc: "Check in attendees who never pre-registered, or bulk-import a CSV of confirmed guests before doors open." },
  { icon: Download, title: 'CSV, Excel & PDF export', desc: 'Export attendee data or dashboard summaries whenever you need a report — no add-ons required.' }
]

const STEPS = [
  { n: '01', title: 'Create your event', desc: 'Add a banner, description, custom fields, ticket tiers, and sessions in one form.' },
  { n: '02', title: 'Share the link', desc: 'Send the registration page directly, or via WhatsApp, email, or your own site.' },
  { n: '03', title: 'Scan at the door', desc: 'Staff check attendees in and out from their phones — live, with a full audit trail.' }
]

export default function Landing() {
  return (
    <div className="bg-paper">
      {/* Nav */}
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gold inline-block" />
          <span className="font-display font-semibold text-lg text-ink">EventoPass</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="#features" className="text-sm text-ink/70 hover:text-ink hidden sm:inline">Features</a>
          <a href="#how-it-works" className="text-sm text-ink/70 hover:text-ink hidden sm:inline">How it works</a>
          <Link to="/login" className="text-sm font-medium bg-navy text-paper rounded-lg px-4 py-2 hover:bg-ink transition-colors">Sign in</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-20 text-center">
        <span className="inline-block text-xs font-mono tracking-wide uppercase text-navy bg-navy/5 border border-navy/10 rounded-full px-3 py-1 mb-6">
          Event registration & attendance, built for the door
        </span>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink leading-tight max-w-3xl mx-auto">
          Registration, badges, and check-in — without the spreadsheet chaos.
        </h1>
        <p className="text-ink/70 text-lg mt-5 max-w-xl mx-auto">
          Build a custom registration form, hand out QR badges, and check attendees in and out from any phone — with a live dashboard the whole team can trust.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
          <Link to="/login" className="bg-gold text-ink font-semibold rounded-lg px-6 py-3 hover:brightness-95 transition">Get started free</Link>
          <a href="#how-it-works" className="border border-gray-300 text-ink rounded-lg px-6 py-3 hover:bg-white transition">See how it works</a>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="font-display text-2xl font-semibold text-ink text-center mb-10">Everything you need to run the door</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-xl p-5">
              <f.icon size={22} className="text-navy mb-3" strokeWidth={1.75} />
              <p className="font-display font-semibold text-ink text-sm mb-1.5">{f.title}</p>
              <p className="text-xs text-ink/60 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-navy text-paper py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-display text-2xl font-semibold text-center mb-12">Three steps, no setup fees</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.n}>
                <p className="font-mono text-gold text-sm mb-2">{s.n}</p>
                <p className="font-display font-semibold text-lg mb-2">{s.title}</p>
                <p className="text-sm text-paper/70 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-ink mb-3">Ready to run your next event?</h2>
        <p className="text-ink/70 mb-7">Create an organizer account and set up your first event in a few minutes.</p>
        <Link to="/login" className="inline-block bg-gold text-ink font-semibold rounded-lg px-6 py-3 hover:brightness-95 transition">Get started free</Link>
      </section>

      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-mist flex-wrap gap-2">
          <span>© {new Date().getFullYear()} EventoPass</span>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
            <span>Registration · Badges · Check-in</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
