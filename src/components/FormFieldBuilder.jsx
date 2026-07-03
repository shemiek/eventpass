const FIELD_TYPES = ['text', 'email', 'phone', 'select', 'checkbox', 'textarea']

export default function FormFieldBuilder({ fields, setFields }) {
  function addField() {
    setFields([...fields, { id: crypto.randomUUID(), label: '', type: 'text', required: false, options: '' }])
  }
  function updateField(id, patch) {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  function removeField(id) {
    setFields(fields.filter((f) => f.id !== id))
  }

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={f.id} className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs font-mono text-mist w-6">{String(i + 1).padStart(2, '0')}</span>
            <input
              placeholder="Field label (e.g. Full name)"
              value={f.label}
              onChange={(e) => updateField(f.id, { label: e.target.value })}
              className="flex-1 min-w-[160px] border border-gray-300 rounded-md px-2 py-1.5 text-sm"
            />
            <select
              value={f.type}
              onChange={(e) => updateField(f.id, { type: e.target.value })}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <label className="text-xs flex items-center gap-1 text-mist">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => updateField(f.id, { required: e.target.checked })}
              />
              required
            </label>
            <button
              type="button"
              onClick={() => removeField(f.id)}
              className="text-stub text-sm hover:underline"
            >
              Remove
            </button>
          </div>
          {f.type === 'select' && (
            <input
              placeholder="Options, comma separated (e.g. VIP, General, Student)"
              value={f.options}
              onChange={(e) => updateField(f.id, { options: e.target.value })}
              className="mt-2 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addField}
        className="text-sm font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy/5"
      >
        + Add field
      </button>
      <p className="text-xs text-mist">Name and email are always collected by default and don't need to be added here.</p>
    </div>
  )
}
