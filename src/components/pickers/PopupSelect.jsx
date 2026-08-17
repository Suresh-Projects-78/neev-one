import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import Modal from '../ui/Modal';

const normalizeText = (v) => String(v || '').trim().toLowerCase();

const PopupSelect = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
  allowCustom = false,
  customActionText = 'Use',
  onCustomAction,
  showValueSubtext = true,
  title,
  maxWidthClass = 'max-w-2xl',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedQuery = normalizeText(query);

  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    return (options || []).filter((o) => {
      const labelText = normalizeText(o?.label);
      const valueText = normalizeText(o?.value);
      const codeText = normalizeText(o?.code);
      return labelText.includes(normalizedQuery) || valueText.includes(normalizedQuery) || codeText.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);

  const normalizedValue = String(value || '').trim();
  const displayLabel = useMemo(() => {
    if (!normalizedValue) return '';
    const exact = (options || []).find((o) => String(o.value || '').trim() === normalizedValue);
    if (!exact) return normalizedValue;
    const labelText = String(exact.label || exact.value || '');
    const codeText = String(exact.code || '').trim();
    return codeText ? `${codeText} - ${labelText}` : labelText;
  }, [normalizedValue, options]);

  const openPopup = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  const closePopup = () => {
    setOpen(false);
    setQuery('');
  };

  const applyValue = (next) => {
    const nextValue = String(next || '').trim();
    onChange?.(nextValue);
    closePopup();
  };

  const runCustomAction = (next) => {
    const nextValue = String(next || '').trim();
    if (!nextValue) return;
    if (typeof onCustomAction === 'function') {
      closePopup();
      onCustomAction(nextValue);
      return;
    }
    applyValue(nextValue);
  };

  const canUseCustom = allowCustom && String(query || '').trim();
  const customValue = String(query || '').trim();
  const customIsAlreadyOption = (options || []).some((o) => String(o?.value || '').trim().toLowerCase() === customValue.toLowerCase());

  return (
    <>
      {label ? <label className="block text-sm font-medium mb-1">{label}</label> : null}
      <button
        type="button"
        onClick={openPopup}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-left ${ disabled ? 'ui-sunken ui-muted cursor-not-allowed' : 'ui-surface ui-hover-sunken'
        }`}
      >
        <span className={displayLabel ? 'ui-fg' : 'ui-subtle'}>{displayLabel || placeholder}</span>
        <ChevronDown size={16} className="ui-muted" />
      </button>

      {open && (
        <Modal onClose={closePopup} title={title || label || 'Select'} maxWidthClass={maxWidthClass}>
          <div className="space-y-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ui-input w-full px-3 py-2"
              placeholder="Search..."
              autoFocus
            />

            {canUseCustom && !customIsAlreadyOption && (
              <button
                type="button"
                onClick={() => runCustomAction(customValue)}
                className="w-full px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-left"
              >
                {String(customActionText || 'Use').trim() || 'Use'} “{customValue}”
              </button>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[55vh] overflow-y-auto divide-y">
                {filtered.length === 0 ? (
                  <div className="px-4 py-10 text-center ui-muted">No results</div>
                ) : (
                  filtered.map((o) => (
                    <button
                      key={`${String(o.value)}-${String(o.label)}`}
                      type="button"
                      onClick={() => applyValue(o.value)}
                      className="w-full px-4 py-3 text-left ui-hover-sunken"
                    >
                      {String(o.code || '').trim() ? (
                        <div className="grid grid-cols-[84px_1fr] gap-3 items-center">
                          <div className="text-xs ui-muted">{String(o.code || '').trim()}</div>
                          <div className="font-medium ui-fg">{o.label}</div>
                        </div>
                      ) : (
                        <div className="font-medium ui-fg">{o.label}</div>
                      )}
                      {showValueSubtext && String(o.value || '').trim() !== String(o.label || '').trim() ? (
                        <div className="text-xs ui-muted">{o.value}</div>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default PopupSelect;
