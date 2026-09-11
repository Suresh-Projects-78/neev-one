import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';

import {
  FREQUENT_SETTINGS,
  categoryFor,
  searchSettings,
  settingFor,
  visibleCategories,
} from './settingsRegistry';

/**
 * Where Settings begins.
 *
 * Thirty-four settings under nine headings is not a menu, it is a list you
 * read — and inside the rail it pushed every other module off the screen. Here
 * they are six cards, a search, and the four a company needs first.
 *
 * The cards count what this person can actually open, not what exists: a card
 * that advertises five settings and opens onto two is a card that lies about
 * what you are allowed to do.
 */

const SettingsCard = ({ category, onOpen }) => {
  const Icon = category.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(category.id)}
      className="ui-card group flex w-full flex-col gap-3 p-5 text-left transition-colors duration-150"
      style={{ borderColor: 'rgb(var(--border))' }}
    >
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'rgb(var(--surface-sunken))', color: 'rgb(var(--brand))' }}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>

      <span className="min-w-0">
        <span className="ui-t-sec block">{category.title}</span>
        <span className="ui-muted mt-1 block text-sm">{category.description}</span>
      </span>

      <span className="mt-auto flex items-center justify-between pt-1">
        <span className="ui-caption">
          {category.items.length} {category.items.length === 1 ? 'setting' : 'settings'}
        </span>
        {/* The arrow moves a little on hover. Enough to say the card is a door,
            not enough to be an animation anybody notices twice. */}
        <ArrowRight
          size={16}
          aria-hidden="true"
          className="ui-subtle transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </span>
    </button>
  );
};

export default function SettingsHub({ can, isEnabled, onOpenCategory, onOpenSetting }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  const categories = useMemo(() => visibleCategories({ can, isEnabled }), [can, isEnabled]);
  const results = useMemo(() => searchSettings(query, { can, isEnabled }), [query, can, isEnabled]);

  const frequent = useMemo(
    () =>
      FREQUENT_SETTINGS.map((key) => settingFor(key)).filter(
        (item) => item && (!item.perm || can(item.perm)) && (!item.feature || isEnabled(item.feature))
      ),
    [can, isEnabled]
  );

  const searching = String(query || '').trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ui-t-page">Settings</h1>
        <p className="ui-muted ui-t-body mt-1">
          Manage your organisation, accounting, tax, security and platform preferences.
        </p>
      </div>

      {/*
        Search before the cards, because somebody who knows what they want
        should not have to work out which of six boxes it lives in.
      */}
      <div className="relative max-w-2xl">
        <Search
          size={16}
          aria-hidden="true"
          className="ui-subtle pointer-events-none absolute start-3 top-1/2 -translate-y-1/2"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ui-input w-full ps-9 pe-9"
          placeholder="Search GST, invoices, users, security…"
          aria-label="Search settings"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
            className="ui-icon-btn ui-btn-sm absolute end-1.5 top-1/2 -translate-y-1/2 !h-7 !w-7"
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {searching ? (
        <div className="ui-card divide-y overflow-hidden" style={{ borderColor: 'rgb(var(--border))' }}>
          {results.length === 0 ? (
            <p className="ui-muted p-5 text-sm">
              Nothing matches “{query.trim()}”. Try the word you would use for it — “password”, “godown”,
              “prefix”.
            </p>
          ) : (
            results.map((item) => {
              const Icon = item.icon;
              const category = categoryFor(item.category);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onOpenSetting(item.key)}
                  className="ui-hover-sunken flex w-full items-start gap-3 p-4 text-left"
                >
                  <Icon size={16} aria-hidden="true" className="ui-subtle mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.title}</span>
                    {/* The path, so a result is a place and not just a name. */}
                    <span className="ui-caption block">Settings · {category?.title}</span>
                    <span className="ui-muted mt-0.5 block text-sm">{item.description}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <>
          {frequent.length ? (
            <div>
              <h2 className="ui-t-label mb-2">Frequently used</h2>
              <div className="flex flex-wrap gap-2">
                {frequent.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onOpenSetting(item.key)}
                      className="ui-btn ui-btn-secondary"
                    >
                      <Icon size={15} aria-hidden="true" /> {item.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <SettingsCard key={category.id} category={category} onOpen={onOpenCategory} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
