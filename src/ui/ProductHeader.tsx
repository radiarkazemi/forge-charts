import { useEffect, useRef, useState, type ReactNode } from "react";

type NavItem = {
  id: string;
  label: string;
  items: Array<{ label: string; hint?: string; action?: () => void; disabled?: boolean }>;
};

type Props = {
  theme: "dark" | "light";
  alertCount: number;
  symbolLabel?: string;
  onOpenSearch: () => void;
  onOpenQuickSearch?: () => void;
  onOpenAlerts: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onOpenMarkets: () => void;
};

function HeaderMenu({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`hdr-menu ${open ? "open" : ""}`}>
      <button type="button" className="hdr-nav-btn" aria-expanded={open} onClick={onToggle}>
        {label}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? <div className="hdr-dropdown">{children}</div> : null}
    </div>
  );
}

export function ProductHeader({
  theme,
  alertCount,
  symbolLabel,
  onOpenSearch,
  onOpenQuickSearch,
  onOpenAlerts,
  onOpenSettings,
  onToggleTheme,
  onOpenMarkets,
}: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node | null;
      if (!node || rootRef.current?.contains(node)) return;
      setOpenMenu(null);
      setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setProfileOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (onOpenQuickSearch || onOpenSearch)();
      }
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [onOpenQuickSearch, onOpenSearch]);

  const toggleMenu = (id: string) => {
    setProfileOpen(false);
    setOpenMenu((cur) => (cur === id ? null : id));
  };

  const nav: NavItem[] = [
    {
      id: "products",
      label: "Products",
      items: [
        { label: "Supercharts", hint: "This workspace", action: () => undefined },
        { label: "Screeners", hint: "Coming soon", disabled: true },
        { label: "Calendar", hint: "Open widget", action: onOpenMarkets },
      ],
    },
    {
      id: "community",
      label: "Community",
      items: [
        { label: "Ideas", hint: "Local only", disabled: true },
        { label: "Scripts", hint: "Pine pane", disabled: true },
      ],
    },
    {
      id: "markets",
      label: "Markets",
      items: [
        { label: "Symbol search", hint: "Browse all markets", action: onOpenSearch },
        { label: "Watchlist", hint: "Right dock", action: onOpenMarkets },
      ],
    },
    {
      id: "brokers",
      label: "Brokers",
      items: [{ label: "Paper trading", hint: "Out of scope", disabled: true }],
    },
    {
      id: "more",
      label: "More",
      items: [
        { label: "Chart settings", action: onOpenSettings },
        { label: theme === "dark" ? "Light theme" : "Dark theme", action: onToggleTheme },
      ],
    },
  ];

  return (
    <header className="product-header" ref={rootRef}>
      <button type="button" className="hdr-brand" title="Forge Supercharts" onClick={onOpenMarkets}>
        <span className="logo" aria-hidden>
          F
        </span>
        <span className="hdr-brand-text">
          <b>Forge</b>
          <em>Supercharts</em>
        </span>
      </button>

      <nav className="hdr-nav" aria-label="Product">
        {nav.map((section) => (
          <HeaderMenu
            key={section.id}
            label={section.label}
            open={openMenu === section.id}
            onToggle={() => toggleMenu(section.id)}
          >
            {section.items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="hdr-drop-item"
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  setOpenMenu(null);
                }}
              >
                <span>{item.label}</span>
                {item.hint ? <em>{item.hint}</em> : null}
              </button>
            ))}
          </HeaderMenu>
        ))}
      </nav>

      <span className="spacer" />

      {symbolLabel ? (
        <span className="hdr-context" title="Active chart symbol">
          {symbolLabel}
        </span>
      ) : null}

      <button type="button" className="hdr-search" onClick={onOpenSearch} title="Search (Ctrl/Cmd+K)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>

      <button
        type="button"
        className="hdr-icon-btn"
        title="Alerts"
        aria-label={`Alerts${alertCount ? `, ${alertCount}` : ""}`}
        onClick={onOpenAlerts}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {alertCount > 0 ? <span className="hdr-badge">{alertCount > 9 ? "9+" : alertCount}</span> : null}
      </button>

      <div className={`hdr-menu ${profileOpen ? "open" : ""}`}>
        <button
          type="button"
          className="hdr-profile"
          aria-expanded={profileOpen}
          title="Profile"
          onClick={() => {
            setOpenMenu(null);
            setProfileOpen((v) => !v);
          }}
        >
          <span className="hdr-avatar" aria-hidden>
            U
          </span>
        </button>
        {profileOpen ? (
          <div className="hdr-dropdown hdr-dropdown-right">
            <div className="hdr-drop-label">Local profile</div>
            <button
              type="button"
              className="hdr-drop-item"
              onClick={() => {
                onOpenSettings();
                setProfileOpen(false);
              }}
            >
              <span>Chart settings</span>
            </button>
            <button
              type="button"
              className="hdr-drop-item"
              onClick={() => {
                onToggleTheme();
                setProfileOpen(false);
              }}
            >
              <span>{theme === "dark" ? "Switch to light" : "Switch to dark"}</span>
            </button>
            <button type="button" className="hdr-drop-item" disabled>
              <span>Cloud sync</span>
              <em>Out of scope</em>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
