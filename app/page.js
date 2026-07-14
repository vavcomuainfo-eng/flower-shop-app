'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getCurrentLocationId } from '@/lib/location';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, lowStock: 0, stockValue: 0 });
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const locId = getCurrentLocationId();
      if (!locId) {
        setLoading(false);
        return;
      }
      const [locRes, stockRes] = await Promise.all([
        supabase.from('locations').select('name').eq('id', locId).single(),
        supabase
          .from('stock_levels')
          .select('quantity, min_quantity, materials(cost_price)')
          .eq('location_id', locId),
      ]);
      if (!locRes.error) setLocationName(locRes.data?.name || '');
      if (!stockRes.error && stockRes.data) {
        const data = stockRes.data;
        const lowStock = data.filter((s) => s.quantity <= s.min_quantity).length;
        const stockValue = data.reduce((sum, s) => sum + s.quantity * (s.materials?.cost_price || 0), 0);
        setStats({ total: data.length, lowStock, stockValue });
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Огляд{locationName ? ` — ${locationName}` : ''}</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : !locationName ? (
        <p className="text-sage">Оберіть магазин у шапці зверху.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-sage/20 rounded p-5">
            <p className="text-sage text-sm mb-1">Позицій на складі тут</p>
            <p className="font-display text-3xl text-ink">{stats.total}</p>
          </div>
          <div className="bg-white border border-sage/20 rounded p-5">
            <p className="text-sage text-sm mb-1">Мало на складі</p>
            <p className={`font-display text-3xl ${stats.lowStock > 0 ? 'text-amber' : 'text-leaf'}`}>
              {stats.lowStock}
            </p>
          </div>
          <div className="bg-white border border-sage/20 rounded p-5">
            <p className="text-sage text-sm mb-1">Вартість складу тут</p>
            <p className="font-display text-3xl text-ink">{stats.stockValue.toFixed(0)} ₴</p>
          </div>
        </div>
      )}

      <p className="text-sage text-sm mt-10">
        Переключити магазин можна вгорі. Звіти по всій мережі — в розділі "Звіти".
      </p>
    </ProtectedPage>
  );
}
