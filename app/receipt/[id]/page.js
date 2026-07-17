'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ReceiptPage() {
  const { id } = useParams();
  const router = useRouter();
  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const [saleRes, itemsRes] = await Promise.all([
        supabase.from('sales').select('*, locations(name), customers(name)').eq('id', id).single(),
        supabase.rpc('get_sale_receipt', { p_sale_id: id }),
      ]);
      if (!saleRes.error) setSale(saleRes.data);
      if (!itemsRes.error) setItems(itemsRes.data || []);
      setLoading(false);
    }
    load();
  }, [id, router]);

  if (loading) {
    return <p className="p-6 text-sage">Завантаження...</p>;
  }

  if (!sale) {
    return <p className="p-6 text-sage">Чек не знайдено.</p>;
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center py-8 px-4">
      <button
        onClick={() => window.print()}
        className="no-print bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 mb-6"
      >
        🖨 Друкувати
      </button>

      <div id="receipt" className="bg-white border border-sage/20 rounded p-6 w-full max-w-xs text-sm">
        <p className="font-display text-xl text-forest text-center mb-1">BaB</p>
        {sale.locations?.name && <p className="text-center text-sage text-xs mb-3">{sale.locations.name}</p>}
        <p className="text-center text-sage text-xs mb-4">
          {new Date(sale.sale_date).toLocaleString('uk-UA')}
        </p>

        <div className="border-t border-b border-dashed border-sage/40 py-3 space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="flex-1">
                {it.item_name} ×{it.quantity}
              </span>
              <span>{Number(it.line_total).toFixed(0)} ₴</span>
            </div>
          ))}
          {sale.discount_percent > 0 && (
            <div className="flex justify-between gap-2 text-rose">
              <span className="flex-1">Знижка {sale.discount_percent}% ({sale.discount_reason})</span>
            </div>
          )}
          {sale.is_delivery && sale.delivery_fee > 0 && (
            <div className="flex justify-between gap-2">
              <span className="flex-1">Доставка</span>
              <span>{Number(sale.delivery_fee).toFixed(0)} ₴</span>
            </div>
          )}
        </div>

        <div className="flex justify-between font-display text-lg text-ink mt-3">
          <span>Разом</span>
          <span>{Number(sale.total_amount).toFixed(0)} ₴</span>
        </div>

        <p className="text-xs text-sage mt-3">
          Оплата: {sale.payment_method}
          {sale.customers?.name ? ` · Клієнт: ${sale.customers.name}` : ''}
        </p>

        <p className="text-center text-sage text-xs mt-6">Дякуємо за покупку!</p>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          #receipt {
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
