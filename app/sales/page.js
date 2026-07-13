'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const CHANNELS = [
  { value: 'store', label: 'На місці' },
  { value: 'own_delivery', label: 'Власна доставка' },
  { value: 'glovo', label: 'Glovo' },
  { value: 'bolt', label: 'Bolt' },
];

export default function SalesPage() {
  const [bouquets, setBouquets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [cart, setCart] = useState([]); // [{type, id, name, price, quantity}] — ціна завжди фіксована
  const [paymentMethod, setPaymentMethod] = useState('готівка');
  const [orderChannel, setOrderChannel] = useState('store');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [externalOrderRef, setExternalOrderRef] = useState('');
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadAll() {
    setLoading(true);
    const [bRes, mRes, sRes] = await Promise.all([
      supabase.from('bouquets').select('id, name, sale_price').eq('is_active', true).order('name'),
      supabase.rpc('get_materials_catalog'),
      supabase
        .from('sales')
        .select('*, sale_items(quantity, price, bouquets(name), materials(name))')
        .order('sale_date', { ascending: false })
        .limit(15),
    ]);
    if (!bRes.error) setBouquets(bRes.data || []);
    if (!mRes.error) setMaterials(mRes.data || []);
    if (!sRes.error) setRecentSales(sRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function addToCart(type, item) {
    const price = item.sale_price;
    setCart((prev) => {
      const existing = prev.find((c) => c.type === type && c.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.type === type && c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { type, id: item.id, name: item.name, price, quantity: 1 }];
    });
  }

  function updateCartQuantity(index, value) {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, quantity: value } : c)));
  }

  function removeFromCart(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const isPlatform = orderChannel === 'glovo' || orderChannel === 'bolt';
  const itemsTotal = cart.reduce((sum, c) => sum + Number(c.price || 0) * Number(c.quantity || 0), 0);
  const total = itemsTotal + (orderChannel === 'own_delivery' ? Number(deliveryFee || 0) : 0);

  function resetOrderExtras() {
    setOrderChannel('store');
    setDeliveryAddress('');
    setDeliveryPhone('');
    setDeliveryDate('');
    setDeliveryFee(0);
    setExternalOrderRef('');
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    setSaving(true);
    setMessage('');

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        total_amount: total,
        payment_method: isPlatform ? orderChannel : paymentMethod,
        order_channel: orderChannel,
        is_delivery: orderChannel !== 'store',
        external_order_ref: isPlatform ? externalOrderRef || null : null,
        delivery_address: orderChannel === 'own_delivery' ? deliveryAddress : null,
        delivery_phone: orderChannel === 'own_delivery' ? deliveryPhone : null,
        delivery_date:
          orderChannel === 'own_delivery' && deliveryDate ? new Date(deliveryDate).toISOString() : null,
        delivery_fee: orderChannel === 'own_delivery' ? Number(deliveryFee || 0) : 0,
      })
      .select()
      .single();

    if (saleError || !sale) {
      setMessage('Помилка при збереженні продажу. Спробуйте ще раз.');
      setSaving(false);
      return;
    }

    const itemRows = cart.map((c) => ({
      sale_id: sale.id,
      bouquet_id: c.type === 'bouquet' ? c.id : null,
      material_id: c.type === 'material' ? c.id : null,
      quantity: Number(c.quantity),
      price: Number(c.price),
    }));
    await supabase.from('sale_items').insert(itemRows);

    for (const c of cart) {
      if (c.type === 'bouquet') {
        await supabase.rpc('deduct_stock_for_bouquet', {
          p_bouquet_id: c.id,
          p_qty: Number(c.quantity),
        });
      } else {
        await supabase.rpc('deduct_material_stock', {
          p_material_id: c.id,
          p_qty: Number(c.quantity),
        });
      }
    }

    setCart([]);
    resetOrderExtras();
    setMessage('Продаж оформлено, склад оновлено.');
    setSaving(false);
    loadAll();
  }

  return (
    <ProtectedPage>
      <h1 className="font-display text-2xl text-forest mb-1">Продажі</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Ліва частина: вибір товару */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h2 className="font-display text-lg text-ink mb-3">Букети</h2>
              {bouquets.length === 0 ? (
                <p className="text-sage text-sm">Немає активних букетів. Додайте на сторінці "Букети".</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {bouquets.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => addToCart('bouquet', b)}
                      className="bg-white border border-sage/20 rounded p-3 text-left hover:border-forest transition-colors"
                    >
                      <p className="text-sm text-ink">{b.name}</p>
                      <p className="text-sm text-sage">{b.sale_price} ₴</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-lg text-ink mb-3">Окремі товари зі складу</h2>
              {materials.length === 0 ? (
                <p className="text-sage text-sm">Немає матеріалів на складі.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {materials.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addToCart('material', m)}
                      disabled={!m.sale_price}
                      className="bg-white border border-sage/20 rounded p-3 text-left hover:border-forest transition-colors disabled:opacity-40"
                    >
                      <p className="text-sm text-ink">{m.name}</p>
                      <p className="text-xs text-sage">
                        {m.sale_price ? `${m.sale_price} ₴` : 'ціну ще не задано'} · залишок: {m.quantity} {m.unit}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-sage mt-2">
                Роздрібну ціну товару задає власник у "Залишках". Без ціни продати окремо не можна.
              </p>
            </div>
          </div>

          {/* Права частина: кошик */}
          <div>
            <h2 className="font-display text-lg text-ink mb-3">Чек</h2>
            <div className="bg-white border border-sage/20 rounded p-4">
              {cart.length === 0 ? (
                <p className="text-sage text-sm">Кошик порожній. Натисніть на товар зліва.</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((c, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">{c.name}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={c.quantity}
                        onChange={(e) => updateCartQuantity(index, e.target.value)}
                        className="w-14 border border-sage/40 rounded px-1 py-1 bg-white text-center"
                      />
                      <span className="w-20 text-right text-ink">{c.price} ₴</span>
                      <button onClick={() => removeFromCart(index)} className="text-rose">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-sage/20 mt-4 pt-4 space-y-3">
                <div>
                  <label className="block text-sm text-sage mb-1">Спосіб продажу</label>
                  <div className="grid grid-cols-4 gap-1">
                    {CHANNELS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setOrderChannel(c.value)}
                        className={`text-xs py-2 rounded border ${
                          orderChannel === c.value
                            ? 'bg-forest text-white border-forest'
                            : 'bg-white text-sage border-sage/40'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!isPlatform && (
                  <div>
                    <label className="block text-sm text-sage mb-1">Спосіб оплати</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                    >
                      <option value="готівка">Готівка</option>
                      <option value="картка">Картка</option>
                      <option value="переказ">Переказ</option>
                    </select>
                  </div>
                )}

                {orderChannel === 'own_delivery' && (
                  <div className="space-y-2 pl-1 border-l-2 border-sage/20 ml-1">
                    <div>
                      <label className="block text-xs text-sage mb-1">Адреса доставки</label>
                      <input
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-sage mb-1">Телефон отримувача</label>
                      <input
                        value={deliveryPhone}
                        onChange={(e) => setDeliveryPhone(e.target.value)}
                        className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-sage mb-1">Дата й час</label>
                        <input
                          type="datetime-local"
                          value={deliveryDate}
                          onChange={(e) => setDeliveryDate(e.target.value)}
                          className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-sage mb-1">Вартість доставки</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryFee}
                          onChange={(e) => setDeliveryFee(e.target.value)}
                          className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isPlatform && (
                  <div className="space-y-2 pl-1 border-l-2 border-sage/20 ml-1">
                    <div>
                      <label className="block text-xs text-sage mb-1">№ замовлення в {orderChannel === 'glovo' ? 'Glovo' : 'Bolt'} (необов'язково)</label>
                      <input
                        value={externalOrderRef}
                        onChange={(e) => setExternalOrderRef(e.target.value)}
                        className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                      />
                    </div>
                    <p className="text-xs text-sage">
                      Оплата надійде від сервісу на картку пізніше — сюди фіксуємо лише сам факт продажу й списання складу.
                    </p>
                  </div>
                )}

                <p className="font-display text-2xl text-ink pt-2">{total.toFixed(0)} ₴</p>

                {message && <p className="text-sm text-leaf">{message}</p>}

                <button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || saving}
                  className="w-full bg-forest text-white text-sm py-2 rounded hover:bg-forest/90 disabled:opacity-50"
                >
                  {saving ? 'Оформлюємо...' : 'Оформити продаж'}
                </button>
              </div>
            </div>

            <h2 className="font-display text-lg text-ink mt-8 mb-3">Останні продажі</h2>
            <div className="space-y-2">
              {recentSales.length === 0 && <p className="text-sage text-sm">Продажів ще не було.</p>}
              {recentSales.map((s) => (
                <div key={s.id} className="bg-white border border-sage/20 rounded p-3 text-sm">
                  <div className="flex justify-between text-ink">
                    <span>{new Date(s.sale_date).toLocaleString('uk-UA')}</span>
                    <span className="font-medium">{s.total_amount} ₴</span>
                  </div>
                  <p className="text-sage text-xs mt-1">
                    {s.sale_items
                      ?.map((it) => it.bouquets?.name || it.materials?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p className="text-sage text-xs">
                    {CHANNELS.find((c) => c.value === s.order_channel)?.label || s.order_channel}
                    {s.external_order_ref ? ` · №${s.external_order_ref}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
