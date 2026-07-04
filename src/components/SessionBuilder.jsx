export default function SessionBuilder({ sessions, setSessions }) {
  function add() { setSessions([...sessions, { title: '', starts_at: '', capacity: '' }]) }
  function update(i, patch) { setSessions(sessions.map((s, idx) => idx === i ? { ...s, ...patch } : s)) }
  function remove(i) { setSessions(sessions.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-2">
      {sessions.map((s, i) => (
        <div key={i} className="flex gap-2 flex-wrap items-center bg-white border border-gray-200 rounded-lg p-3">
          <input placeholder="Session title (e.g. Keynote)" value={s.title} onChange={(e) => update(i, { title: e.target.value })} className="flex-1 min-w-[140px] border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input type="datetime-local" value={s.starts_at} onChange={(e) => update(i, { starts_at: e.target.value })} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input type="number" min="0" placeholder="Capacity" value={s.capacity} onChange={(e) => update(i, { capacity: e.target.value })} className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <button type="button" onClick={() => remove(i)} className="text-stub text-xs hover:underline">Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-sm font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy/5">+ Add session</button>
    </div>
  )
}
