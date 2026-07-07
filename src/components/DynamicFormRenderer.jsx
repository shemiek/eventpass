export default function DynamicFormRenderer({ fields, values, setValues }) {
  function set(label, val) {
    setValues({ ...values, [label]: val })
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.id}>
          <label className="text-sm font-medium text-ink">
            {f.label} {f.required && <span className="text-stub">*</span>}
          </label>

          {f.type === 'textarea' && (
            <textarea
              required={f.required} rows={3}
              value={values[f.label] || ''}
              onChange={(e) => set(f.label, e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          )}

          {f.type === 'select' && (
            <select
              required={f.required}
              value={values[f.label] || ''}
              onChange={(e) => set(f.label, e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select…</option>
              {f.options.split(',').map((o) => (
                <option key={o.trim()} value={o.trim()}>{o.trim()}</option>
              ))}
            </select>
          )}

          {f.type === 'checkbox' && (
            <div className="mt-1">
              <input
                type="checkbox"
                checked={Boolean(values[f.label])}
                onChange={(e) => set(f.label, e.target.checked)}
              />
            </div>
          )}

          {['text', 'email', 'phone', 'date'].includes(f.type) && (
            <input
              type={f.type === 'phone' ? 'tel' : f.type}
              required={f.required}
              value={values[f.label] || ''}
              onChange={(e) => set(f.label, e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          )}
        </div>
      ))}
    </div>
  )
}
