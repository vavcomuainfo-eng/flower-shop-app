'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

export default function PurchasesPage() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // [{material_id, quantity, unit_cost}]
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadAll() {
    setLoading(true);
    const [mRes, sRes, pRes] = await Promise.all([
      supabase.from('materials').select('id, name, unit, cost_price').order('name'),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase
        .from('purchases')
        .select('*, suppliers(name), purchase_items(quantity, unit_cost, materials(name))')
        .order('purchase_date', { ascending: false })
        .limit(10),
    ]);
    if (!mRes.error) setMaterials(mRes.data || []);
    if (!sRes.error) setSuppliers(sRes.data || []);
    if (!pRes.error) setRecentPurchases(pRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function addItemRow() {
    setItems([...items, { material_id: materials[0]?.id || '', quantity: 1, unit_cost: 0 }]);
  }

  function updateItemRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    // при виборі матеріалу — підставляємо його поточну закупівельну ціну як стартову
    if (field === 'material_id') {
      const m = materials.find((mat) => mat.id === value);
      if (m) next[index].unit_cost = m.cost_price;
    }
    setItems(next);
  }

  function removeItemRow(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);

  async function handleSave() {
    const validItems = items.filter((it) => it.material_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setMessage('Додайте хоча б одну позицію.');
      return;
    }
    setSaving(true);
    setMessage('');

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({ supplier_id: supplierId || null, total_cost: total, notes })
      .select()
      .single();

    if (purchaseError || !purchase) {
      setMessage('Помилка при збереженні. Спробуйте ще раз.');
      setSaving(false);
      return;
    }

    const rows = validItems.map((it) => ({
      purchase_id: purchase.id,
      material_id: it.material_id,
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
    }));
    await supabase.from('purchase_items').insert(rows);

    // Поповнюємо склад і оновлюємо закупівельну ціну на актуальну
    for (const it of validItems) {
      const material = materials.find((m) => m.id === it.material_id);
      const currentQty = material ? Number(material.quantity || 0) : 0;
      await supabase
        .from('materials')
        .update({
          quantity: (currentQty || 0) + Number(it.quantity),
          cost_price: Number(it.unit_cost),
          updated_at: new Date().toISOString(),
        })
        .eq('id', it.material_id);
    }

    setItems([]);
    setSupplierId('');
    setNotes('');
    setMessage('Склад поповнено.');
    setSaving(false);
    loadAll();
  }

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Поповнення складу</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white border border-sage/20 rounded p-5">
            <h2 className="font-display text-lg text-ink mb-3">Нове надходження</h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-sage mb-1">Постачальник</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  <option value="">— не вказано —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Нотатка</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                />
              </div>
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
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={it.material_id}
                    onChange={(e) => updateItemRow(index, 'material_id', e.target.value)}
                    className="flex-1 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="кількість"
                    value={it.quantity}
                    onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                    className="w-24 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ціна/од."
                    value={it.unit_cost}
                    onChange={(e) => updateItemRow(index, 'unit_cost', e.target.value)}
                    className="w-24 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  />
                  <button onClick={() => removeItemRow(index)} className="text-rose text-sm px-1">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-sage/20 mt-4 pt-4 flex items-center justify-between">
              <p className="font-display text-xl text-ink">{total.toFixed(0)} ₴</p>
              <button
                onClick={handleSave}
                disabled={saving || materials.length === 0}
                className="bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 disabled:opacity-50"
              >
                {saving ? 'Зберігаємо...' : 'Оприбуткувати'}
              </button>
            </div>
            {message && <p className="text-sm text-leaf mt-2">{message}</p>}
          </div>

          <div>
            <h2 className="font-display text-lg text-ink mb-3">Останні надходження</h2>
            <div className="space-y-2">
              {recentPurchases.length === 0 && (
                <p className="text-sage text-sm">Надходжень ще не було.</p>
              )}
              {recentPurchases.map((p) => (
                <div key={p.id} className="bg-white border border-sage/20 rounded p-3 text-sm">
                  <div className="flex justify-between text-ink">
                    <span>{new Date(p.purchase_date).toLocaleDateString('uk-UA')}</span>
                    <span className="font-medium">{p.total_cost} ₴</span>
                  </div>
                  {p.suppliers?.name && <p className="text-sage text-xs mt-1">{p.suppliers.name}</p>}
                  <p className="text-sage text-xs mt-1">
                    {p.purchase_items
                      ?.map((it) => `${it.materials?.name} ×${it.quantity}`)
                      .join(', ')}
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
