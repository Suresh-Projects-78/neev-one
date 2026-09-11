import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

import { breadcrumbFor, categoryFor, groupedForCategory, settingFor } from './settingsRegistry';

/**
 * A category, with its settings down the side.
 *
 * This is local navigation: the settings inside the category somebody chose.
 * It is deliberately not the global rail — that lists the product's modules and
 * stays where it is. Mixing the two is what made Settings a forty-item menu
 * hanging off a sidebar that also had to hold Sales, Purchases and the rest.
 */

const Breadcrumb = ({ crumbs, onNavigate }) => (
  <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
    {crumbs.map((crumb, i) => (
      <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
        {i > 0 ? <ChevronRight size={14} aria-hidden="true" className="ui-subtle" /> : null}
        {crumb.target ? (
          <button type="button" onClick={() => onNavigate(crumb.target)} className="ui-muted hover:ui-fg underline-offset-2 hover:underline">
            {crumb.label}
          </button>
        ) : (
          <span aria-current="page">{crumb.label}</span>
        )}
      </span>
    ))}
  </nav>
);

const LocalNavItem = ({ item, selected, onSelect }) => {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-current={selected ? 'page' : undefined}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors duration-150"
      style={
        selected
          ? {
              /* Tinted, not filled: the row should read as chosen without
                 becoming the loudest thing on the screen. */
              backgroundColor: 'rgb(var(--brand) / 0.10)',
              color: 'rgb(var(--fg))',
              boxShadow: 'inset 2px 0 0 rgb(var(--brand))',
            }
          : undefined
      }
    >
      <Icon
        size={15}
        aria-hidden="true"
        className="shrink-0"
        style={selected ? { color: 'rgb(var(--brand))' } : undefined}
      />
      <span className={selected ? 'truncate font-medium' : 'ui-muted truncate'}>{item.title}</span>
    </button>
  );
};

export default function SettingsWorkspace({ categoryId, activeKey, can, isEnabled, onNavigate, children }) {
  const item = settingFor(activeKey);
  const id = categoryId || item?.category || '';
  const category = categoryFor(id);

  const groups = useMemo(() => (id ? groupedForCategory(id, { can, isEnabled }) : []), [id, can, isEnabled]);

  const crumbs = useMemo(() => {
    if (item) return breadcrumbFor(item.key);
    return [
      { label: 'Settings', target: 'settings' },
      { label: category?.title || 'Settings', target: null },
    ];
  }, [item, category]);

  if (!category) return children || null;

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={crumbs} onNavigate={onNavigate} />

      <div>
        <h1 className="ui-t-page">{item?.title || category.title}</h1>
        <p className="ui-muted ui-t-body mt-1">{item?.description || category.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/*
          On a phone this is a strip above the content rather than a second
          permanent sidebar — two of those on a 390px screen leaves nothing for
          the setting itself.
        */}
        <nav aria-label={`${category.title} settings`} className="min-w-0">
          <div className="ui-card p-2 lg:sticky lg:top-4">
            <div className="flex gap-1 overflow-x-auto lg:block lg:overflow-visible">
              {groups.map((group, gi) => (
                <div key={group.name || `g${gi}`} className="min-w-max lg:min-w-0">
                  {group.name ? (
                    <div className="ui-caption hidden px-3 pb-1 pt-2 lg:block">{group.name}</div>
                  ) : null}
                  <div className="flex gap-1 lg:block lg:space-y-0.5">
                    {group.items.map((navItem) => (
                      <LocalNavItem
                        key={navItem.key}
                        item={navItem}
                        selected={navItem.key === activeKey}
                        onSelect={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
