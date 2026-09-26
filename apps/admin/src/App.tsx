import { adminUrl } from './site.ts';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.tsx';
import { LoginPage } from './pages/Login.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { PostsPage } from './pages/Posts.tsx';
import { PostEditorPage } from './pages/PostEditor.tsx';
import { MediaPage } from './pages/Media.tsx';
import { PluginsPage } from './pages/Plugins.tsx';
import { PluginPage } from './pages/PluginPage.tsx';
import { UsersPage } from './pages/Users.tsx';
import { ThemesPage } from './pages/Themes.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { IconGalleryPage } from './pages/IconGallery.tsx';
import { api } from './api.ts';
import { Icon } from './icons.tsx';
import { AdminBar, AdminFooter, ShellContext, Sidebar, type AdminPage, type Counts } from './shell.tsx';

const EMPTY_COUNTS: Counts = { posts: 0, pages: 0, users: 0, activePlugins: 0, drafts: 0, published: 0 };

function Shell({ children }: { children: ReactNode }) {
  const [pluginPages, setPluginPages] = useState<AdminPage[]>([]);
  const [siteName, setSiteName] = useState('PressForge');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('cms.menu.collapsed') === '1',
  );

  useEffect(() => {
    localStorage.setItem('cms.menu.collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    api
      .get<{ adminPages: AdminPage[] }>('/api/plugins')
      .then((data) => setPluginPages(data.adminPages ?? []))
      .catch(() => setPluginPages([]));
    api
      .get<{ siteName: string; counts: Omit<Counts, 'drafts' | 'published'> }>('/api/system/status')
      .then(async (status) => {
        setSiteName(status.siteName || 'PressForge');
        const [drafts, published] = await Promise.all([
          api
            .get<{ total: number }>('/api/posts?type=post&status=draft&per_page=1')
            .then((r) => r.total)
            .catch(() => 0),
          api
            .get<{ total: number }>('/api/posts?type=post&status=publish&per_page=1')
            .then((r) => r.total)
            .catch(() => 0),
        ]);
        setCounts({ ...status.counts, drafts, published });
      })
      .catch(() => undefined);
  }, []);

  return (
    <ShellContext.Provider
      value={{ pluginPages, siteName, counts, collapsed, setCollapsed, mobileMenuOpen, setMobileMenuOpen }}
    >
      <div className={`wp-shell${collapsed ? ' menu-collapsed' : ''}`}>
        <Sidebar />
        <div className="wp-main">
          <AdminBar />
          <div className="wp-wrap">
            <AdminFooter>{children}</AdminFooter>
          </div>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

function Page({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="wp-page-title">
        <h1>
          {icon && <Icon name={icon} size={24} />}
          <span>{title}</span>
        </h1>
        {actions && <div className="heading-actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="login-page">Memuat…</div>;
  if (!user) return <LoginPage />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Page title="Dasbor" icon="dashboard"><DashboardPage /></Page>} />
        <Route
          path="/posts"
          element={
            <Page
              title="Artikel"
              icon="post"
              actions={
                <a className="wp-btn primary" href={adminUrl('/posts/new')}>
                  <Icon name="plus" size={16} />
                  <span>Tambah Artikel</span>
                </a>
              }
            >
              <PostsPage type="post" />
            </Page>
          }
        />
        <Route
          path="/pages"
          element={
            <Page
              title="Halaman"
              icon="page"
              actions={
                <a className="wp-btn primary" href={adminUrl('/pages/new')}>
                  <Icon name="plus" size={16} />
                  <span>Tambah Halaman</span>
                </a>
              }
            >
              <PostsPage type="page" />
            </Page>
          }
        />
        <Route path="/posts/new" element={<PostEditorPage type="post" />} />
        <Route path="/pages/new" element={<PostEditorPage type="page" />} />
        <Route path="/posts/:id" element={<PostEditorPage type="post" />} />
        <Route path="/pages/:id" element={<PostEditorPage type="page" />} />
        <Route path="/media" element={<Page title="Media" icon="media"><MediaPage /></Page>} />
        <Route path="/plugins" element={<Page title="Plugin" icon="plugin"><PluginsPage /></Page>} />
        <Route path="/plugin/:pluginId/:pageSlug" element={<PluginPage />} />
        <Route path="/users" element={<Page title="Pengguna" icon="users"><UsersPage /></Page>} />
        <Route path="/themes" element={<Page title="Tampilan" icon="appearance"><ThemesPage /></Page>} />
        <Route path="/settings" element={<Page title="Pengaturan" icon="settings"><SettingsPage /></Page>} />
        {import.meta.env.DEV && (
          <Route path="/dev/icons" element={<Page title="Ikon" icon="star"><IconGalleryPage /></Page>} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}