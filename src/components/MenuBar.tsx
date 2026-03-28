import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ──

interface MenuAction {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: false;
}

interface MenuSeparator {
  separator: true;
}

type MenuItem = MenuAction | MenuSeparator;

interface MenuDef {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: MenuDef[];
}

// ── Helpers ──

function isMac() {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

function formatShortcut(shortcut: string): string {
  if (isMac()) {
    return shortcut
      .replace("Ctrl+", "\u2318")
      .replace("Shift+", "\u21E7")
      .replace("Alt+", "\u2325");
  }
  return shortcut;
}

// ── Component ──

export function MenuBar({ menus }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (openMenu === null) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Close on Escape
  useEffect(() => {
    if (openMenu === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openMenu]);

  const handleMenuClick = useCallback(
    (idx: number) => {
      setOpenMenu((prev) => (prev === idx ? null : idx));
    },
    []
  );

  const handleItemClick = useCallback(
    (item: MenuAction) => {
      if (item.disabled) return;
      setOpenMenu(null);
      item.onClick();
    },
    []
  );

  return (
    <nav
      ref={barRef}
      role="menubar"
      aria-label="Application menu"
      className="flex items-center bg-surface-1 border-b border-surface-3 px-1 select-none"
      style={{ height: 28, WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {menus.map((menu, idx) => (
        <div key={menu.label} className="relative">
          <button
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={openMenu === idx}
            aria-label={`${menu.label} menu`}
            onClick={() => handleMenuClick(idx)}
            onMouseEnter={() => {
              if (openMenu !== null && openMenu !== idx) setOpenMenu(idx);
            }}
            className={`px-3 py-0.5 text-xs rounded transition-colors ${
              openMenu === idx
                ? "bg-surface-3 text-gray-100"
                : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
            }`}
          >
            {menu.label}
          </button>

          {openMenu === idx && (
            <div role="menu" aria-label={`${menu.label} submenu`} className="absolute left-0 top-full mt-0.5 bg-surface-2 border border-surface-3 rounded-lg shadow-2xl py-1 z-[100] min-w-[220px]">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div
                    key={`sep-${i}`}
                    role="separator"
                    className="border-t border-surface-3 my-1"
                  />
                ) : (
                  <button
                    key={item.label}
                    role="menuitem"
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-3 hover:text-gray-100 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-between gap-4"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-gray-500 text-[10px] font-mono">
                        {formatShortcut(item.shortcut)}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
