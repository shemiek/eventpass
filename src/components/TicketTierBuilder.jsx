export default function TicketTierBuilder({ tiers, setTiers }) {
  function add() { setTiers([...tiers, { name: '', capacity: '', price: '' }]) }
  function update(i, patch) { setTiers(tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t)) }
  function remove(i) { setTiers(tiers.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-2">
      {tiers.map((t, i) => (
        <div key={i} className="flex gap-2 flex-wrap items-center bg-white border border-gray-200 rounded-lg p-3">
          <input placeholder="Tier name (e.g. VIP)" value={t.name} onChange={(e) => update(i, { name: e.target.value })} className="flex-1 min-w-[120px] border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input type="number" min="0" placeholder="Capacity" value={t.capacity} onChange={(e) => update(i, { capacity: e.target.value })} className="w-28 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input type="number" min="0" step="0.01" placeholder="Price (optional)" value={t.price} onChange={(e) => update(i, { price: e.target.value })} className="w-32 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <button type="button" onClick={() => remove(i)} className="text-stub text-xs hover:underline">Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-sm font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy/5">+ Add tier</button>
    </div>
  )
}
