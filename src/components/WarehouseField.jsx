import React, { useEffect } from 'react';
import { Lock } from 'lucide-react';

/**
 * The warehouse a document belongs to.
 *
 * The header is where a user says where they are working. Once they have
 * picked a branch and a warehouse there, every entry belongs to that place and
 * asking again on each form is both noise and a chance to file a bill against
 * the wrong shelf. So this field locks to the header selection and simply says
 * so. With "All warehouses" picked — a supervisor looking across the company —
 * there is nothing to inherit, and the field asks.
 *
 * An existing document keeps whatever warehouse it was created in: rewriting
 * that silently because someone opened it from another warehouse would move
 * stock nobody asked to move.
 */
const WarehouseField = ({
  value,
  onChange,
  options = [],
  activeWarehouseId = '',
  branchLabel = '',
  isEdit = false,
  label = 'Warehouse *',
  className = 'ui-select w-full px-3 py-2',
  required = true,
}) => {
  const active = String(activeWarehouseId || '').trim();
  const locked = Boolean(active) && !isEdit;

  // Keep the form's value on the header selection while it is locked.
  useEffect(() => {
    if (!locked) return;
    if (String(value || '') === active) return;
    onChange?.(active);
  }, [locked, active, value, onChange]);

  if (locked) {
    const picked = options.find((w) => String(w.id) === active);
    const name = picked?.name || `Warehouse ${active}`;
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{label.replace(' *', '')}</label>
        <div className="ui-input w-full px-3 py-2 flex items-center gap-2 ui-sunken" aria-readonly="true">
          <Lock size={14} className="ui-muted shrink-0" aria-hidden="true" />
          <span className="truncate">
            {branchLabel ? `${branchLabel} · ` : ''}
            {name}
          </span>
        </div>
        <div className="text-xs ui-muted mt-1">From the header. Switch it there to enter somewhere else.</div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        className={className}
        required={required}
      >
        <option value="">Select Warehouse</option>
        {options.map((w) => (
          <option key={String(w.id)} value={String(w.id)}>
            {w.name || `Warehouse ${w.id}`}
          </option>
        ))}
      </select>
    </div>
  );
};

export default WarehouseField;
