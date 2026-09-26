import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';

export function PluginPage() {
  const { pluginId, pageSlug } = useParams();
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .html(`/api/plugins/${pluginId}/admin/${pageSlug}`)
      .then(setHtml)
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat halaman plugin'));
  }, [pluginId, pageSlug]);

  return (
    <>
      <div className="wp-page-title">
        <h1>Plugin</h1>
        <div className="heading-actions">
          <Link className="wp-btn" to="/">
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
      {error ? (
        <div className="wp-notice error">{error}</div>
      ) : (
        <div className="plugin-page" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </>
  );
}