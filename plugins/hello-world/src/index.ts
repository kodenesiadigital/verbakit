import { definePlugin } from '@verbakit/plugin-sdk';

export default definePlugin((api) => {
  const countKey = 'hello_world_visit_count';

  api.addAction('cms.dashboard.visit', async () => {
    const raw = await api.getOption(countKey);
    const current = raw ? Number(raw) : 0;
    await api.setOption(countKey, String(current + 1));
  });

  api.addFilter('content.render', (value: unknown) => {
    if (typeof value !== 'string') return value;
    return `${value}\n<!-- rendered by Hello World filter -->`;
  });

  api.registerAdminPage({
    slug: 'hello-world-status',
    title: 'Hello World Status',
    render: async () => {
      const visits = Number((await api.getOption(countKey)) ?? '0');
      return `<h2>Hello World</h2>
        <p>Plugin aktif v${api.version}. Dashboard telah dikunjungi <strong>${visits}</strong> kali.</p>
        <p>Halaman ini dirender server-side oleh plugin, persis halaman admin plugin di WordPress.</p>`;
    },
  });

  return {
    activate: () => api.log('hello-world activated'),
    deactivate: () => api.log('hello-world deactivated'),
  };
});