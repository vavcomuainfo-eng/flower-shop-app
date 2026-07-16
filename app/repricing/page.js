'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

export default function RepricingPage() {
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('Усі');
  const [selected, setSelected] = useState({}); // {materialId: true}
  const [drafts, setDrafts] = useState({}); // {materialId: {sale_price, cost_price}}
  const [percent, setPercent] = useState(0);
  const [priceField, setPriceField] = useState('sale_price'); // 'sale_price' | 'cost_price'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadMaterials() {
    setLoading(true);
    const [mRes, cRes] = await Promise.all([
      supabase.from('materials').select('id, name, cost_price, sale_price, categories(name)').order('name'),
      supabase.from('categories').select('id, name').order('name'),
    ]);
    if (!mRes.error) {
      setMaterials(mRes.data || []);
      const initDrafts = {};
      (mRes.data || []).forEach((m) => {
        initDrafts[m.id] = { sale_price: m.sale_price, cost_price: m.cost_price };
      });
      setDrafts(initDrafts);
    }
    if (!cRes.error) setCategories(cRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  const filtered = materials.filter(
    (m) => categoryFilter === 'Усі' || m.categories?.name === categoryFilter
  );

  function toggleSelect(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSelectAll() {
    const allSelected = filtered.every((m) => selected[m.id]);
    const next = { ...selected };
    filtered.forEach((m) => (next[m.id] = !allSelected));
    setSelected(next);
  }

  function applyPercent() {
    const next = { ...drafts };
    filtered.forEach((m) => {
      if (!selected[m.id]) return;
      const base = Number(materials.find((x) => x.id === m.id)[priceField]) || 0;
      const updated = Math.round(base * (1 + Number(percent) / 100) * 100) / 100;
      next[m.id] = { ...next[m.id], [priceField]: updated };
    });
    setDrafts(next);
  }

  function updateDraft(id, field, value) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    let changedCount = 0;

    for (const m of materials) {
      const draft = drafts[m.id];
      if (!draft) continue;
      const newSale = Number(draft.sale_price);
      const newCost = Number(draft.cost_price);
      if (newSale === Number(m.sale_price) && newCost === Number(m.cost_price)) continue;

      await supabase
        .from('materials')
        .update({ sale_price: newSale, cost_price: newCost, updated_at: new Date().toISOString() })
        .eq('id', m.id);

      await supabase.from('price_history').insert({
        material_id: m.id,
        old_cost_price: m.cost_price,
        new_cost_price: newCost,
        old_sale_price: m.sale_price,
        new_sale_price: newSale,
      });
      changedCount += 1;
    }

    setMessage(changedCount > 0 ? `Оновлено цін: ${changedCount}.` : 'Немає змін для збереження.');
    setSaving(false);
    loadMaterials();
    setSelected({});
  }

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Переоцінка</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <>
          <div className="bg-white border border-sage/20 rounded p-5 mb-6">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-sage mb-1">Яку ціну міняти</label>
                <select
                  value={priceField}
                  onChange={(e) => setPriceField(e.target.value)}
                  className="border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                >
                  <option value="sale_price">Роздрібну</option>
                  <option value="cost_price">Закупівельну</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-sage mb-1">На скільки % (можна від'ємне)</label>
                <input
                  type="number"
                  step="0.1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-28 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                />
              </div>
              <button
                onClick={applyPercent}
                className="bg-forest text-white text-sm px-4 py-2 rounded hover:bg-forest/90"
              >
                Застосувати до обраних
              </button>
              <p className="text-xs text-sage">
                Обрано: {Object.values(selected).filter(Boolean).length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {['Усі', ...new Set(materials.map((m) => m.categories?.name).filter(Boolean))].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  categoryFilter === cat ? 'bg-forest text-white border-forest' : 'bg-white text-sage border-sage/40'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="bg-white border border-sage/20 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-sage border-b border-sage/20">
                  <th className="px-4 py-3">
                    <input type="checkbox" onChange={toggleSelectAll} />
                  </th>
                  <th className="px-4 py-3 font-medium">Назва</th>
                  <th className="px-4 py-3 font-medium">Закупівельна (зараз → нова)</th>
                  <th className="px-4 py-3 font-medium">Роздрібна (зараз → нова)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const draft = drafts[m.id] || {};
                  const costChanged = Number(draft.cost_price) !== Number(m.cost_price);
                  const saleChanged = Number(draft.sale_price) !== Number(m.sale_price);
                  return (
                    <tr key={m.id} className="border-b border-sage/10 last:border-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!selected[m.id]}
                          onChange={() => toggleSelect(m.id)}
                        />
                      </td>
                      <td className="px-4 py-3">{m.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-sage">{m.cost_price} ₴ → </span>
                        <input
                          type="number"
                          step="0.01"
                          value={draft.cost_price ?? ''}
                          onChange={(e) => updateDraft(m.id, 'cost_price', e.target.value)}
                          className={`w-24 border rounded px-2 py-1 bg-white ${
                            costChanged ? 'border-forest text-forest font-medium' : 'border-sage/40'
                          }`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sage">{m.sale_price} ₴ → </span>
                        <input
                          type="number"
                          step="0.01"
                          value={draft.sale_price ?? ''}
                          onChange={(e) => updateDraft(m.id, 'sale_price', e.target.value)}
                          className={`w-24 border rounded px-2 py-1 bg-white ${
                            saleChanged ? 'border-forest text-forest font-medium' : 'border-sage/40'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4">
            {message && <p className="text-sm text-leaf">{message}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 disabled:opacity-50"
            >
              {saving ? 'Зберігаємо...' : 'Зберегти зміни цін'}
            </button>
          </div>
        </>
      )}
    </ProtectedPage>
  );
}
