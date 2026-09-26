export type Role = 'admin' | 'editor' | 'author' | 'subscriber';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
}

export type PostStatus = 'publish' | 'draft' | 'trash';
export type TaxonomyKind = 'category' | 'tag';

export interface Term {
  id: string;
  kind: TaxonomyKind;
  name: string;
  slug: string;
  parent?: string | null;
}

export interface Post {
  id: string;
  type: 'post' | 'page' | 'attachment';
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: PostStatus;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, string>;
}

export interface PostSummary extends Post {
  terms: Term[];
}

export interface Option {
  name: string;
  value: string;
}

export interface PluginManifest {
  /** Unique plugin id, e.g. "hello-world". */
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** ESM entry resolving to a module with a default `register(context)` export. */
  entry: string;
  /** Semver requirement for the core host, e.g. ">=0.1.0". */
  requires?: string;
  /** Optional statically bundled assets the admin serves as admin-side JS/CSS. */
  admin?: {
    /** Relative path to a client script injected into the admin panel. */
    script?: string;
    style?: string;
  };
}

export type PluginStatus = 'active' | 'inactive';

export interface Plugin extends PluginManifest {
  installed: boolean;
  status: PluginStatus;
}

export const DEFAULT_OPTIONS = {
  site_name: 'My Site',
  site_tagline: 'Just another PressForge site',
  site_language: 'id',
  posts_per_page: '10',
  permalink_structure: '/blog/:slug',
} satisfies Record<string, string>;