import type { Env } from '../types.ts';
import { getOption, setOption } from '../db.ts';
import { json } from '../router.ts';
import type { RouteDef } from './types.ts';

export interface Theme {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  template: string;
  stylesheet: string;
}

export const BUILT_IN_THEMES: Theme[] = [
  {
    id: 'twenty-twentyfive',
    name: 'Twenty Twenty-Five',
    description: 'Tema default WordPress 2025: tipografi besar, layout modern.',
    version: '1.0.0',
    author: 'Verbakit',
    template: '',
    stylesheet: '',
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Tema blog klasik dengan sidebar dan tipografi serif.',
    version: '1.0.0',
    author: 'Verbakit',
    template: '',
    stylesheet: '',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Tema minimalis tanpa chrome, fokus pada konten.',
    version: '1.0.0',
    author: 'Verbakit',
    template: '',
    stylesheet: '',
  },
];

const THEMES_KEY = 'active_theme';
const DEFAULT_THEME_ID = 'twenty-twentyfive';

export async function resolveTheme(env: Env): Promise<Theme> {
  const activeId = (await getOption(env, THEMES_KEY)) || DEFAULT_THEME_ID;
  return BUILT_IN_THEMES.find((t) => t.id === activeId) ?? BUILT_IN_THEMES[0]!;
}

export const themeRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/themes',
    handler: async ({ env, user }) => {
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const activeId = (await getOption(env, THEMES_KEY)) || DEFAULT_THEME_ID;
      return json({
        themes: BUILT_IN_THEMES.map((t) => ({ ...t, status: t.id === activeId ? 'active' : 'inactive' })),
      });
    },
  },
  {
    method: 'post',
    path: '/api/themes/:id/activate',
    handler: async ({ env, user, params }) => {
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.role !== 'admin') return json({ error: 'Hanya admin' }, 403);
      const theme = BUILT_IN_THEMES.find((t) => t.id === params['id']);
      if (!theme) return json({ error: 'Tema tidak ditemukan' }, 404);
      await setOption(env, THEMES_KEY, theme.id);
      return json({ ok: true, active: theme.id });
    },
  },
];