'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getMyRole } from '@/lib/role';

export default function RepricingPage() {
  const [role, setRole] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('Усі');
  const [selected, setSelected] = useState({});
  const [drafts, setDrafts] = useState({});
  const [percent, setPercent] = useState(0);
  const [priceField, setPriceField] = useState('sale_price');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [locations, setLocations] = useState([]);
  const [partialLocationId, setPartialLocationId] = useState('');
  const [locationStock, setLocationStock] = useState([]);
  const [partialMaterialId, setPartialMaterialId] = useState('');
  const [partialQty, setPartialQty] = useState('');
  const [partialPrice, setPartialPrice] = useState('');
  const [partialSaving, setPartialSaving] = useState(false);
  const [partialMessage, setPartialMessage] = useState('');

  const canEditCost = role === 'owner';

  async function loadMaterials(r) {
    setLoading(true);
    if (r === 'owner') {
      const [mRes, cRes] = await Promise.all([
        supabase.from('materials').select('id, name, cost_price, sale_price, categories(name)').order('name'),
        supabase.from('categories').select('id, name').order('name'),
      ]);
      if (!mRes.error) {
        const normalized = (mRes.data || []).map((m) => ({ ...m, category_name: m.categories?.name }));
        setMaterials(normalized);
        const initDrafts = {};
        normalized.forEach((m) => {
          initDrafts[m.id] = { sale_price: m.sale_price, cost_price: m.cost_price };
        });
        setDrafts(initDrafts);
      }
      if (!cRes.error) setCategories(cRes.data || []);
    } else {
      const { data, error } = await supabase.rpc('get_materials_prices');
      if (!error) {
        setMaterials(data || []);
        const initDrafts = {};
        (data || []).forEach((m) => {
          initDrafts[m.id] = { sale_price: m.sale_price };
        });
        setDrafts(initDrafts);
        setCategories([...new Set((data || []).map((m) => m.category_name).filter(Boolean))].map((name) => ({ name })));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const r = await getMyRole();
      setRole(r);
      if (r !== 'owner') setPriceField('sale_price');
      loadMaterials(r);
      const { data } = await supabase.rpc('get_my_locations');
      setLocations(data || []);
      if (data?.length) setPartialLocationId(data[0].id);
    }
    init();
  }, []);

  useEffect(() => {
    async function loadStock() {
      if (!partialLocationId) return;
      const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: partialLocationId });
      if (!error) setLocationStock(data || []);
    }
    loadStock();
  }, [partialLocationId]);

  async function handlePartialReprice() {
    if (!partialMaterialId || !partialQty || !partialPrice) {
      setPartialMessage('Заповніть товар, кількість і нову ціну.');
      return;
    }
    setPartialSaving(true);
    setPartialMessage('');
    const materialName = locationStock.find((m) => m.id === partialMaterialId)?.name || 'товар';
    const qtyUsed = partialQty;
    const priceUsed = partialPrice;
    const { error } = await supabase.rpc('partial_reprice', {
      p_location_id: partialLocationId,
      p_material_id: partialMaterialId,
      p_split_quantity: Number(partialQty),
      p_new_sale_price: Number(partialPrice),
    });
    if (error) {
      setPartialMessage('Помилка: ' + error.message);
    } else {
      setPartialMessage(
        `Готово — уцінено ${qtyUsed} шт "${materialName}" до ${priceUsed} ₴, решта лишилась за старою ціною.`
      );
      setPartialQty('');
      setPartialPrice('');
      loadMaterials(role);
      const { data } = await supabase.rpc('get_materials_catalog', { p_location_id: partialLocationId });
      setLocationStock(data || []);
    }
    setPartialSaving(false);
  }

  const filtered = materials.filter(
    (m) => categoryFilter === 'Усі' || m.category_name === categoryFilter
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
    const selectedCount = Object.values(selected).filter(Boolean).length;
    if (selectedCount === 0) {
      setMessage('Спочатку відмітьте галочками товари зліва в таблиці (або "виділити все" вгорі стовпця) — відсоток застосовується тільки до обраних.');
      return;
    }
    setMessage('');
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

      if (canEditCost) {
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
      } else {
        if (newSale === Number(m.sale_price)) continue;
        await supabase.rpc('update_material_sale_price', {
          p_material_id: m.id,
          p_new_sale_price: newSale,
        });
      }
      changedCount += 1;
    }

    setMessage(changedCount > 0 ? `Оновлено цін: ${changedCount}.` : 'Немає змін для збереження.');
    setSaving(false);
    loadMaterials(role);
    setSelected({});
  }

  return (
    <ProtectedPage>
      <h1 className="font-display text-2xl text-forest mb-1">Переоцінка</h1>
      <div className="stem-divider w-16 mb-8" />
      {!canEditCost && role && (
        <p className="text-xs text-sage -mt-6 mb-8">
          Ви бачите й можете змінювати лише роздрібну ціну. Закупівельна лишається видимою тільки власнику.
        </p>
      )}

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <>
          <div className="bg-white border border-sage/20 rounded p-5 mb-6">
            <div className="flex flex-wrap items-end gap-3">
              {canEditCost && (
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
              )}
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

          <div className="bg-white border border-amber/40 rounded p-5 mb-6">
            <h2 className="font-display text-lg text-ink mb-1">Уцінити частину партії</h2>
            <p className="text-xs text-sage mb-3">
              Коли під однією назвою є і свіжий товар, і той, що треба уцінити — ця частина відокремиться в
              окрему позицію "(уцінка)" з новою ціною, а решта лишиться за старою ціною.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-sage mb-1">Магазин</label>
                <select
                  value={partialLocationId}
                  onChange={(e) => setPartialLocationId(e.target.value)}
                  className="border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
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
                <label className="block text-xs text-sage mb-1">Товар</label>
                <select
                  value={partialMaterialId}
                  onChange={(e) => setPartialMaterialId(e.target.value)}
                  className="border border-sage/40 rounded px-2 py-1.5 bg-white text-sm min-w-[160px]"
                >
                  <option value="">— оберіть —</option>
                  {locationStock.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (є: {m.quantity} {m.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-sage mb-1">Кількість для уцінки</label>
                <input
                  type="number"
                  step="1"
                  value={partialQty}
                  onChange={(e) => setPartialQty(e.target.value)}
                  className="w-28 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-sage mb-1">Нова ціна (роздрібна)</label>
                <input
                  type="number"
                  step="0.01"
                  value={partialPrice}
                  onChange={(e) => setPartialPrice(e.target.value)}
                  className="w-28 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                />
              </div>
              <button
                onClick={handlePartialReprice}
                disabled={partialSaving}
                className="bg-amber text-white text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
              >
                {partialSaving ? 'Зберігаємо...' : 'Уцінити'}
              </button>
            </div>
            {partialMessage && <p className="text-xs text-leaf mt-2">{partialMessage}</p>}
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {['Усі', ...new Set(categories.map((c) => c.name).filter(Boolean))].map((cat) => (
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
          )}

          <div className="bg-white border border-sage/20 rounded overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="text-left text-sage border-b border-sage/20">
                  <th className="px-4 py-3">
                    <input type="checkbox" onChange={toggleSelectAll} />
                  </th>
                  <th className="px-4 py-3 font-medium">Назва</th>
                  {canEditCost && <th className="px-4 py-3 font-medium">Закупівельна (зараз → нова)</th>}
                  <th className="px-4 py-3 font-medium">Роздрібна (зараз → нова)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const draft = drafts[m.id] || {};
                  const costChanged = canEditCost && Number(draft.cost_price) !== Number(m.cost_price);
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
                      {canEditCost && (
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
                      )}
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
