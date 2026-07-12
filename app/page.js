'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, lowStock: 0, stockValue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('materials').select('*');
      if (!error && data) {
        const lowStock = data.filter((m) => m.quantity <= m.min_quantity).length;
        const stockValue = data.reduce((sum, m) => sum + m.quantity * m.cost_price, 0);
        setStats({ total: data.length, lowStock, stockValue });
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <ProtectedPage>
      <h1 className="font-display text-2xl text-forest mb-1">Огляд</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-sage/20 rounded p-5">
            <p className="text-sage text-sm mb-1">Позицій на складі</p>
            <p className="font-display text-3xl text-ink">{stats.total}</p>
          </div>
          <div className="bg-white border border-sage/20 rounded p-5">
            <p className="text-sage text-sm mb-1">Мало на складі</p>
            <p className={`font-display text-3xl ${stats.lowStock > 0 ? 'text-amber' : 'text-leaf'}`}>
              {stats.lowStock}
            </p>
          </div>
          <div className="bg-white border border-sage/20 rounded p-5">
            <p className="text-sage text-sm mb-1">Вартість складу</p>
            <p className="font-display text-3xl text-ink">{stats.stockValue.toFixed(0)} ₴</p>
          </div>
        </div>
      )}

      <p className="text-sage text-sm mt-10">
        Модулі «Букети», «Продажі» та «Постачальники» додамо наступними кроками.
      </p>
    </ProtectedPage>
  );
}
