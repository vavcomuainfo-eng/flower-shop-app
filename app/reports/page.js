'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay() || 7; // неділя = 0 -> робимо 7
  d.setDate(d.getDate() - day + 1); // понеділок
  return d;
}
function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

const PRESETS = [
  { key: 'today', label: 'Сьогодні', from: startOfToday },
  { key: 'week', label: 'Цей тиждень', from: startOfWeek },
  { key: 'month', label: 'Цей місяць', from: startOfMonth },
];

export default function ReportsPage() {
  const [preset, setPreset] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [topBouquets, setTopBouquets] = useState([]);
  const [loading, setLoading] = useState(true);

  function getRange() {
    if (preset === 'custom') {
      const from = customFrom ? new Date(customFrom) : startOfWeek();
      const to = customTo ? new Date(customTo + 'T23:59:59') : new Date();
      return { from, to };
    }
    const found = PRESETS.find((p) => p.key === preset);
    return { from: found.from(), to: new Date() };
  }

  async function loadReport() {
    setLoading(true);
    const { from, to } = getRange();
    const [sRes, dRes, tRes] = await Promise.all([
      supabase.rpc('get_sales_report', { p_from: from.toISOString(), p_to: to.toISOString() }),
      supabase.rpc('get_daily_sales', { p_from: from.toISOString(), p_to: to.toISOString() }),
      supabase.rpc('get_top_bouquets', { p_from: from.toISOString(), p_to: to.toISOString(), p_limit: 5 }),
    ]);
    if (!sRes.error) setSummary(sRes.data?.[0] || null);
    if (!dRes.error) setDaily(dRes.data || []);
    if (!tRes.error) setTopBouquets(tRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo]);

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Звіти</h1>
      <div className="stem-divider w-16 mb-8" />

      <div className="flex flex-wrap items-center gap-2 mb-8">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`text-sm px-4 py-2 rounded border ${
              preset === p.key ? 'bg-forest text-white border-forest' : 'bg-white text-sage border-sage/40'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`text-sm px-4 py-2 rounded border ${
            preset === 'custom' ? 'bg-forest text-white border-forest' : 'bg-white text-sage border-sage/40'
          }`}
        >
          Свій період
        </button>
        {preset === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
            />
            <span className="text-sage text-sm">—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
            />
          </>
        )}
      </div>

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            <div className="bg-white border border-sage/20 rounded p-5">
              <p className="text-sage text-sm mb-1">Виручка</p>
              <p className="font-display text-2xl text-ink">{(summary?.revenue || 0).toFixed(0)} ₴</p>
            </div>
            <div className="bg-white border border-sage/20 rounded p-5">
              <p className="text-sage text-sm mb-1">Собівартість</p>
              <p className="font-display text-2xl text-ink">{(summary?.cost || 0).toFixed(0)} ₴</p>
            </div>
            <div className="bg-white border border-sage/20 rounded p-5">
              <p className="text-sage text-sm mb-1">Прибуток</p>
              <p
                className={`font-display text-2xl ${
                  (summary?.profit || 0) >= 0 ? 'text-leaf' : 'text-rose'
                }`}
              >
                {(summary?.profit || 0).toFixed(0)} ₴
              </p>
            </div>
            <div className="bg-white border border-sage/20 rounded p-5">
              <p className="text-sage text-sm mb-1">Замовлень</p>
              <p className="font-display text-2xl text-ink">{summary?.orders_count || 0}</p>
            </div>
          </div>

          <p className="text-xs text-sage -mt-8 mb-10">
            Собівартість рахується за поточними закупівельними цінами матеріалів (не історичними на момент продажу).
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h2 className="font-display text-lg text-ink mb-3">По днях</h2>
              {daily.length === 0 ? (
                <p className="text-sage text-sm">Продажів за цей період не було.</p>
              ) : (
                <div className="bg-white border border-sage/20 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-sage border-b border-sage/20">
                        <th className="px-4 py-2 font-medium">Дата</th>
                        <th className="px-4 py-2 font-medium">Виручка</th>
                        <th className="px-4 py-2 font-medium">Прибуток</th>
                        <th className="px-4 py-2 font-medium">Замовлень</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((d) => (
                        <tr key={d.day} className="border-b border-sage/10 last:border-0">
                          <td className="px-4 py-2">{new Date(d.day).toLocaleDateString('uk-UA')}</td>
                          <td className="px-4 py-2">{Number(d.revenue).toFixed(0)} ₴</td>
                          <td className={`px-4 py-2 ${Number(d.profit) >= 0 ? 'text-leaf' : 'text-rose'}`}>
                            {Number(d.profit).toFixed(0)} ₴
                          </td>
                          <td className="px-4 py-2">{d.orders_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-lg text-ink mb-3">Топ букетів</h2>
              {topBouquets.length === 0 ? (
                <p className="text-sage text-sm">Букети за цей період не продавались.</p>
              ) : (
                <div className="bg-white border border-sage/20 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-sage border-b border-sage/20">
                        <th className="px-4 py-2 font-medium">Букет</th>
                        <th className="px-4 py-2 font-medium">К-сть</th>
                        <th className="px-4 py-2 font-medium">Виручка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topBouquets.map((b, i) => (
                        <tr key={i} className="border-b border-sage/10 last:border-0">
                          <td className="px-4 py-2">{b.name}</td>
                          <td className="px-4 py-2">{Number(b.qty).toFixed(0)}</td>
                          <td className="px-4 py-2">{Number(b.revenue).toFixed(0)} ₴</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </ProtectedPage>
  );
}
