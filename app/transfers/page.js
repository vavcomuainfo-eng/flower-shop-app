'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

export default function TransfersPage() {
  const [locations, setLocations] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [fromStock, setFromStock] = useState([]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // [{material_id, quantity}]
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadLocations() {
    const { data, error } = await supabase.rpc('get_my_locations');
    if (!error) {
      setLocations(data || []);
      setFromId((prev) => prev || data?.find((l) => l.type === 'warehouse')?.id || data?.[0]?.id || '');
      setToId((prev) => prev || data?.find((l) => l.type === 'shop')?.id || '');
    }
  }

  async function loadFromStock(locId) {
    if (!locId) return setFromStock([]);
    const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: locId });
    if (!error) setFromStock(data || []);
  }

  async function loadRecentTransfers() {
    const { data, error } = await supabase
      .from('transfers')
      .select('*, from:locations!transfers_from_location_id_fkey(name), to:locations!transfers_to_location_id_fkey(name), transfer_items(quantity, materials(name))')
      .order('transfer_date', { ascending: false })
      .limit(10);
    if (!error) setRecentTransfers(data || []);
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadLocations();
      await loadRecentTransfers();
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (fromId) loadFromStock(fromId);
  }, [fromId]);

  function addItemRow() {
    setItems([...items, { material_id: fromStock[0]?.id || '', quantity: 1 }]);
  }

  function updateItemRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  }

  function removeItemRow(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  function stockFor(materialId) {
    return fromStock.find((m) => m.id === materialId)?.quantity ?? 0;
  }

  async function handleSave() {
    if (!fromId || !toId) {
      setMessage('Оберіть звідки і куди переміщуємо.');
      return;
    }
    if (fromId === toId) {
      setMessage('Точка відправлення й отримання не можуть співпадати.');
      return;
    }
    const validItems = items.filter((it) => it.material_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setMessage('Додайте хоча б одну позицію.');
      return;
    }
    setSaving(true);
    setMessage('');

    const { data: transfer, error: transferError } = await supabase
      .from('transfers')
      .insert({ from_location_id: fromId, to_location_id: toId, notes })
      .select()
      .single();

    if (transferError || !transfer) {
      setMessage('Помилка при збереженні. Спробуйте ще раз.');
      setSaving(false);
      return;
    }

    const rows = validItems.map((it) => ({
      transfer_id: transfer.id,
      material_id: it.material_id,
      quantity: Number(it.quantity),
    }));
    await supabase.from('transfer_items').insert(rows);

    for (const it of validItems) {
      const qty = Number(it.quantity);
      await supabase.rpc('restock_material', { p_material_id: it.material_id, p_add_quantity: -qty, p_location_id: fromId });
      await supabase.rpc('restock_material', { p_material_id: it.material_id, p_add_quantity: qty, p_location_id: toId });
    }

    setItems([]);
    setNotes('');
    setMessage('Переміщення виконано.');
    setSaving(false);
    loadFromStock(fromId);
    loadRecentTransfers();
  }

  return (
    <ProtectedPage>
      <h1 className="font-display text-2xl text-forest mb-1">Переміщення</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white border border-sage/20 rounded p-5">
            <h2 className="font-display text-lg text-ink mb-3">Нове переміщення</h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-sage mb-1">Звідки</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.type === 'warehouse' ? '📦 ' : '🏬 '}
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Куди</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.type === 'warehouse' ? '📦 ' : '🏬 '}
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-sage mb-1">Нотатка</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm mb-4"
              />
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-sage">Товари</label>
              <button onClick={addItemRow} className="text-forest text-sm hover:underline">
                + додати позицію
              </button>
            </div>

            {items.length === 0 && <p className="text-xs text-sage mb-2">Ще нічого не додано.</p>}

            <div className="space-y-2">
              {items.map((it, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <select
                    value={it.material_id}
                    onChange={(e) => updateItemRow(index, 'material_id', e.target.value)}
                    className="flex-1 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  >
                    {fromStock.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (є: {m.quantity} {m.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="кількість"
                    value={it.quantity}
                    onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                    className="w-28 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  />
                  <button onClick={() => removeItemRow(index)} className="text-rose text-sm px-1">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {items.some((it) => Number(it.quantity) > stockFor(it.material_id)) && (
              <p className="text-amber text-xs mt-2">
                Увага: для деяких позицій кількість перевищує наявний залишок у точці відправлення.
              </p>
            )}

            <div className="border-t border-sage/20 mt-4 pt-4 flex items-center justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 disabled:opacity-50"
              >
                {saving ? 'Переміщуємо...' : 'Перемістити'}
              </button>
            </div>
            {message && <p className="text-sm text-leaf mt-2">{message}</p>}
          </div>

          <div>
            <h2 className="font-display text-lg text-ink mb-3">Останні переміщення</h2>
            <div className="space-y-2">
              {recentTransfers.length === 0 && <p className="text-sage text-sm">Переміщень ще не було.</p>}
              {recentTransfers.map((t) => (
                <div key={t.id} className="bg-white border border-sage/20 rounded p-3 text-sm">
                  <div className="flex justify-between text-ink">
                    <span>{new Date(t.transfer_date).toLocaleDateString('uk-UA')}</span>
                  </div>
                  <p className="text-ink text-xs mt-1">
                    {t.from?.name} → {t.to?.name}
                  </p>
                  <p className="text-sage text-xs mt-1">
                    {t.transfer_items?.map((it) => `${it.materials?.name} ×${it.quantity}`).join(', ')}
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
