import { createUser, getUsers, updateUser, deleteUser } from '../db.ts';
import { hashPassword } from '../security.ts';
import { json, notFound, badRequest, forbidden } from '../router.ts';
import type { RouteDef } from './types.ts';
import type { Role } from '@cms/core';

const ROLES: Role[] = ['admin', 'editor', 'author', 'subscriber'];

export const userRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/users',
    handler: async ({ env, user }) => {
      if (!user) return forbidden();
      return json({ users: await getUsers(env) });
    },
  },
  {
    method: 'post',
    path: '/api/users',
    handler: async ({ env, user, request }) => {
      if (!user) return forbidden();
      if (user.role !== 'admin') return forbidden('Hanya admin yang dapat menambah pengguna');
      const body = (await request.json()) as {
        username?: string;
        email?: string;
        password?: string;
        role?: string;
      };
      const username = String(body.username ?? '').trim();
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      const role = (ROLES.includes(body.role as Role) ? body.role : 'subscriber') as Role;
      if (!username || !email || password.length < 8) {
        return badRequest('username, email, dan password (minimal 8 karakter) wajib diisi');
      }
      const result = await createUser(env, { username, email, password, role });
      return json({ user: result }, 201);
    },
  },
  {
    method: 'put',
    path: '/api/users/:id',
    handler: async ({ env, user, params, request }) => {
      if (!user) return forbidden();
      if (user.role !== 'admin' && user.uid !== params['id']) return forbidden();
      const body = (await request.json()) as { email?: string; role?: string; password?: string };
      const result = await updateUser(env, params['id']!, {
        email: body.email ? String(body.email) : undefined,
        role: ROLES.includes(body.role as Role) ? (body.role as Role) : undefined,
        passwordHash: body.password ? await hashPassword(String(body.password)) : undefined,
      });
      if (!result) return notFound('Pengguna tidak ditemukan');
      return json({ user: result });
    },
  },
  {
    method: 'delete',
    path: '/api/users/:id',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (user.role !== 'admin') return forbidden('Hanya admin');
      if (user.uid === params['id']) return badRequest('Tidak dapat menghapus akun sendiri');
      const ok = await deleteUser(env, params['id']!);
      if (!ok) return notFound('Pengguna tidak ditemukan');
      return json({ ok: true });
    },
  },
];