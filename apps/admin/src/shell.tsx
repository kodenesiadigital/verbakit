import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './auth.tsx';
import { siteUrl, adminUrl } from './site.ts';
import { Icon } from './icons.tsx';

export interface AdminPage {
  pluginId: string;
  pluginName: string;
  slug: string;
  title: string;
}

export interface Counts {
  posts: number;
  pages: number;
  users: number;
  activePlugins: number;
  drafts: number;
  published: number;
}

interface SubDef {
  to: string;
  label: string;
  icon?: string;
  countKey?: keyof Counts;
}

interface MenuDef {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  adminOnly?: boolean;
  submenu?: SubDef[];
}

const MENU: MenuDef[] = [
  { to: '/', label: 'Dasbor', icon: 'dashboard', end: true },
  {
    to: '/posts',
    label: 'Artikel',
    icon: 'post',
    submenu: [
      { to: '/posts', label: 'Semua Artikel', icon: 'list', countKey: 'posts' },
      { to: '/posts?status=publish', label: 'Published', icon: 'screen', countKey: 'published' },
      { to: '/posts?status=draft', label: 'Draft', icon: 'edit', countKey: 'drafts' },
      { to: '/posts/new', label: 'Tambah Baru', icon: 'plus' },
    ],
  },
  {
    to: '/media',
    label: 'Media',
    icon: 'media',
    submenu: [
      { to: '/media', label: 'Semua Media', icon: 'list' },
      { to: '/media?action=upload', label: 'Tambah Baru', icon: 'plus' },
    ],
  },
  {
    to: '/pages',
    label: 'Halaman',
    icon: 'page',
    submenu: [
      { to: '/pages', label: 'Semua Halaman', icon: 'list', countKey: 'pages' },
      { to: '/pages/new', label: 'Tambah Baru', icon: 'plus' },
    ],
  },
  {
    to: '/themes',
    label: 'Tampilan',
    icon: 'appearance',
    submenu: [
      { to: '/themes', label: 'Tema', icon: 'appearance' },
      { to: '/themes?tab=customize', label: 'Sesuaikan Tampilan', icon: 'settings' },
    ],
  },
  {
    to: '/plugins',
    label: 'Plugin',
    icon: 'plugin',
    submenu: [
      { to: '/plugins', label: 'Plugin Terpasang', icon: 'list', countKey: 'activePlugins' },
      { to: '/plugins?tab=add', label: 'Tambah Plugin', icon: 'plus' },
    ],
  },
  {
    to: '/users',
    label: 'Pengguna',
    icon: 'users',
    adminOnly: true,
    submenu: [
      { to: '/users', label: 'Semua Pengguna', icon: 'list', countKey: 'users' },
      { to: '/users?action=add', label: 'Tambah Baru', icon: 'plus' },
    ],
  },
  {
    to: '/profil',
    label: 'Profil Saya',
    icon: 'users',
    submenu: [{ to: '/profil', label: 'Edit Profil', icon: 'edit' }],
  },
  {
    to: '/settings',
    label: 'Pengaturan',
    icon: 'settings',
    submenu: [
      { to: '/settings', label: 'Umum', icon: 'settings' },
      { to: '/settings?tab=writing', label: 'Penulisan', icon: 'edit' },
      { to: '/settings?tab=permalink', label: 'Permalink', icon: 'blog' },
    ],
  },
];

export interface ShellData {
  pluginPages: AdminPage[];
  siteName: string;
  counts: Counts;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  /** Drawer menu untuk layar kecil. */
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (value: boolean) => void;
}

const EMPTY_COUNTS: Counts = { posts: 0, pages: 0, users: 0, activePlugins: 0, drafts: 0, published: 0 };

export const ShellContext = createContext<ShellData>({
  pluginPages: [],
  siteName: 'Verbakit',
  counts: EMPTY_COUNTS,
  collapsed: false,
  setCollapsed: () => undefined,
  mobileMenuOpen: false,
  setMobileMenuOpen: () => undefined,
});

export function useShell(): ShellData {
  return useContext(ShellContext);
}

function MenuLink({
  to,
  label,
  icon,
  end,
  count,
  onNavigate,
}: {
  to: string;
  label: string;
  icon?: string;
  end?: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  const queryIndex = to.indexOf('?');
  const path = queryIndex >= 0 ? to.slice(0, queryIndex) : to;
  const search = queryIndex >= 0 ? to.slice(queryIndex + 1) : '';
  return (
    <NavLink
      to={search ? `${path}?${search}` : path}
      end={end}
      title={label}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? 'wp-current' : undefined)}
    >
      {icon && <Icon name={icon} size={20} />}
      <span className="wp-menu-label">{label}</span>
      {count !== undefined && count > 0 && <span className="wp-count">{count}</span>}
    </NavLink>
  );
}

/**
 * Submenu sidebar dibuka dengan hover. Untuk pengguna keyboard, kita tandai
 * navigasi keyboard (Tab ditekan) lalu buka submenu menu yang sedang difokus —
 * hanya satu submenu pada satu waktu supaya tidak saling menumpuk.
 */
function useKeyboardSubmenu() {
  useEffect(() => {
    const nav = document.querySelector('.wp-sidebar');
    if (!nav) return;

    const usingKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      nav.classList.add('kb-nav');
    };
    const usingMouse = () => nav.classList.remove('kb-nav');

    const onFocusIn = (event: Event) => {
      if (!nav.classList.contains('kb-nav')) return;
      if (!(event instanceof FocusEvent)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest('.wp-menu > li');
      if (!item) return;
      for (const other of nav.querySelectorAll('.wp-menu > li.is-open')) {
        if (other !== item) other.classList.remove('is-open');
      }
      item.classList.add('is-open');
    };

    const onFocusOut = (event: Event) => {
      if (!(event instanceof FocusEvent)) return;
      const target = event.relatedTarget;
      const item = nav.querySelector('.wp-menu > li.is-open');
      if (!item) return;
      if (target instanceof Node && item.contains(target)) return;
      item.classList.remove('is-open');
    };

    const onClick = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest('.wp-menu > li');
      if (item?.classList.contains('is-open')) item.classList.remove('is-open');
    };

    document.addEventListener('keydown', usingKeyboard);
    document.addEventListener('mousedown', usingMouse);
    nav.addEventListener('focusin', onFocusIn);
    nav.addEventListener('focusout', onFocusOut);
    nav.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', usingKeyboard);
      document.removeEventListener('mousedown', usingMouse);
      nav.removeEventListener('focusin', onFocusIn);
      nav.removeEventListener('focusout', onFocusOut);
      nav.removeEventListener('click', onClick);
    };
  }, []);
}

/**
 * Di layar sentuh tidak ada hover, jadi tombol chevron di samping menu induk
 * dipakai untuk membuka/menutup submenu (hanya tautan, tidak pindah halaman).
 */
function useTouchSubmenu() {
  useEffect(() => {
    const nav = document.querySelector('.wp-sidebar');
    if (!nav) return;

    const onClick = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const toggle = target.closest('.wp-submenu-toggle');
      if (!toggle) return;
      event.preventDefault();
      event.stopPropagation();
      const item = toggle.closest('.wp-menu > li');
      if (!item) return;
      const isOpen = item.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    };

    nav.addEventListener('click', onClick);
    return () => nav.removeEventListener('click', onClick);
  }, []);
}

export function Sidebar() {
  const { pluginPages, siteName, counts, collapsed, mobileMenuOpen, setMobileMenuOpen } = useShell();
  const { user, logout } = useAuth();
  useKeyboardSubmenu();
  useTouchSubmenu();

  const menus: MenuDef[] = MENU.filter((item) => !item.adminOnly || user?.role === 'admin').map(
    (item): MenuDef => {
      // Halaman admin dari plugin disisipkan ke submenu Plugin (bukan menu terpisah).
      if (item.to === '/plugins' && pluginPages.length > 0) {
        return {
          ...item,
          submenu: [
            ...(item.submenu ?? []),
            ...pluginPages.map<SubDef>((page) => ({
              to: `/plugin/${page.pluginId}/${page.slug}`,
              label: page.title,
              icon: 'plugin',
            })),
          ],
        };
      }
      return item;
    },
  );

  return (
    <>
      <div
        className={`wp-backdrop${mobileMenuOpen ? ' is-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <nav
        id="cms-sidebar"
        className={`wp-sidebar${collapsed ? ' collapsed' : ''}${mobileMenuOpen ? ' mobile-open' : ''}`}
        aria-label="Menu admin"
      >
        <div className="site-switcher">
          <span className="badge-site">{siteName.slice(0, 2).toUpperCase()}</span>
          <span className="site-name">{siteName}</span>
          <button
            className="sidebar-close"
            aria-label="Tutup menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <ul className="wp-menu">
          {menus.map((item) => (
            <li key={item.to} className={item.submenu ? 'has-submenu' : undefined}>
              <div className="wp-menu-row">
                <MenuLink
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  end={item.end}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
                {item.submenu && (
                  <button className="wp-submenu-toggle" aria-label={`Submenu ${item.label}`}>
                    <Icon name="chevron" size={16} />
                  </button>
                )}
              </div>
              {item.submenu && (
                <ul className="wp-submenu">
                  {item.submenu.map((child) => (
                    <li key={child.to}>
                      <MenuLink
                        to={child.to}
                        label={child.label}
                        icon={child.icon}
                        count={child.countKey ? counts[child.countKey] : undefined}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {/* Footer sidebar: nama pengguna + tombol Keluar, seperti WordPress */}
        <div className="wp-sidebar-footer">
          <p className="sb-avatar" aria-hidden="true">
            {(user?.username ?? '?').slice(0, 1).toUpperCase()}
          </p>
          <p className="sb-user">
            <span className="sb-name">{user?.username ?? 'Tamu'}</span>
            <span className="sb-role">{user?.role ?? '—'}</span>
          </p>
          <button className="sb-logout" onClick={() => void logout()} title="Keluar dari dasbor">
            <Icon name="close" size={16} />
            <span>Keluar</span>
          </button>
        </div>
      </nav>
    </>
  );
}

export function AdminBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { collapsed, setCollapsed, mobileMenuOpen, setMobileMenuOpen } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const section =
    location.pathname === '/'
      ? 'Dasbor'
      : (location.pathname.split('/').filter(Boolean)[0] ?? '').replace(/^\w/, (c) => c.toUpperCase());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setMobileMenuOpen]);

  return (
    <div className="wp-adminbar">
      <button
        className="ab-toggle ab-burger"
        aria-label="Buka menu"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen(true)}
      >
        <Icon name="list" size={18} />
      </button>
      <button
        className="ab-toggle ab-collapse"
        title={collapsed ? 'Tampilkan menu' : 'Sembunyikan menu'}
        aria-label={collapsed ? 'Tampilkan menu' : 'Sembunyikan menu'}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon name="list" size={16} />
      </button>
      <a className="ab-link" href={siteUrl('/')} target="_blank" rel="noreferrer" title="Lihat situs">
        <Icon name="home" size={16} />
        <span className="ab-label">Beranda situs</span>
      </a>
      <span className="sep">|</span>
      <span className="ab-section">{section}</span>
      <div className="right">
        <a className="ab-link ab-hide-sm" href={siteUrl('/blog')} target="_blank" rel="noreferrer">
          <Icon name="blog" size={16} />
          <span className="ab-label">Lihat Blog</span>
        </a>
        <a className="ab-link ab-hide-sm" href={siteUrl('/sitemap.xml')} target="_blank" rel="noreferrer" title="sitemap.xml">
          <Icon name="chart" size={16} />
          <span className="ab-label">Sitemap</span>
        </a>
        <span className="sep">|</span>
        <button
          className="ab-avatar"
          onClick={() => setMenuOpen((value) => !value)}
          aria-expanded={menuOpen}
          title="Akun Anda"
        >
          {(user?.username ?? '?').slice(0, 1).toUpperCase()}
        </button>
        {menuOpen && (
          <div className="ab-menu">
            <div className="ab-menu-header">
              <span className="avatar-lg">{(user?.username ?? '?').slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{user?.username}</strong>
                <div className="muted">{user?.email}</div>
              </div>
            </div>
            <a href={adminUrl('/profil')} onClick={() => setMenuOpen(false)}>
              <Icon name="users" size={16} /> Profil Saya
            </a>
            <a href={adminUrl('/')} onClick={() => setMenuOpen(false)}>
              <Icon name="dashboard" size={16} /> Dasbor
            </a>
            <a href={siteUrl('/')} target="_blank" rel="noreferrer">
              <Icon name="home" size={16} /> Lihat situs
            </a>
            <button onClick={() => void logout()}>
              <Icon name="chevron" size={16} /> Keluar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminFooter({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <div className="wp-footer">
        <p>
          Terima kasih telah menggunakan <strong>Verbakit</strong>.
        </p>
        <p className="muted">Versi 0.1.0 &middot; Seluruh hak cipta dilindungi.</p>
      </div>
    </>
  );
}
