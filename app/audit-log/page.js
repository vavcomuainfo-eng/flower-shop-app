'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const REVERT_FN = {
  'Прихід товару': 'revert_purchase',
  'Списання': 'revert_write_off',
  'Переміщення': 'revert_transfer',
  'Інвентаризація': 'revert_stocktake',
  'Переоцінка': 'revert_price_change',
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_audit_log', { p_limit: 150 });
    if (!error) setEntries(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRevert(entry) {
    const fn = REVERT_FN[entry.action_type];
    if (!fn) return;
    if (!confirm('Скасувати цю дію? Залишки та ціни повернуться до попереднього стану.')) return;
    const { error } = await supabase.rpc(fn, { p_id: entry.id });
    if (error) {
      setMessage('Не вдалося скасувати: ' + error.message);
    } else {
      setMessage('Дію скасовано.');
      load();
    }
  }

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Журнал дій</h1>
      <div className="stem-divider w-16 mb-8" />
      <p className="text-xs text-sage mb-6">
        Усі дії команди — прихід товару, списання, переміщення, інвентаризації, переоцінки — з іменем автора. Дію можна скасувати одним натиском.
      </p>

      {message && <p className="text-sm text-leaf mb-4">{message}</p>}

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : entries.length === 0 ? (
        <p className="text-sage">Ще немає жодної дії.</p>
      ) : (
        <div className="bg-white border border-sage/20 rounded overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="text-left text-sage border-b border-sage/20">
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Дія</th>
                <th className="px-4 py-3 font-medium">Автор</th>
                <th className="px-4 py-3 font-medium">Точка / товар</th>
                <th className="px-4 py-3 font-medium">Деталі</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.action_type}-${e.id}`} className="border-b border-sage/10 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(e.action_date).toLocaleString('uk-UA')}</td>
                  <td className="px-4 py-3">{e.action_type}</td>
                  <td className="px-4 py-3 text-sage">{e.actor_email || '—'}</td>
                  <td className="px-4 py-3">{e.location_name || '—'}</td>
                  <td className="px-4 py-3 text-sage">{e.summary}</td>
                  <td className="px-4 py-3">
                    {e.reverted ? (
                      <span className="text-xs text-sage">скасовано</span>
                    ) : (
                      <button onClick={() => handleRevert(e)} className="text-rose text-xs hover:underline">
                        Скасувати
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedPage>
  );
}
