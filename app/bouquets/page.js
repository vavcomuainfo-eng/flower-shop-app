'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const emptyForm = { id: null, name: '', sale_price: 0, description: '', is_active: true };

export default function BouquetsPage() {
  const [bouquets, setBouquets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]); // [{material_id, quantity}]
  const [showForm, setShowForm] = useState(false);

  async function loadBouquets() {
    setLoading(true);
    const { data, error } = await supabase
      .from('bouquets')
      .select('*, bouquet_items(quantity, materials(name, cost_price))')
      .order('name', { ascending: true });
    if (!error) setBouquets(data || []);
    setLoading(false);
  }

  async function loadMaterials() {
    const { data, error } = await supabase
      .from('materials')
      .select('id, name, cost_price')
      .order('name', { ascending: true });
    if (!error) setMaterials(data || []);
  }

  useEffect(() => {
    loadBouquets();
    loadMaterials();
  }, []);

  function costOf(bouquet) {
    return (bouquet.bouquet_items || []).reduce(
      (sum, it) => sum + it.quantity * (it.materials?.cost_price || 0),
      0
    );
  }

  function openNew() {
    setForm(emptyForm);
    setItems([]);
    setShowForm(true);
  }

  async function openEdit(b) {
    setForm({
      id: b.id,
      name: b.name,
      sale_price: b.sale_price,
      description: b.description || '',
      is_active: b.is_active,
    });
    const { data } = await supabase
      .from('bouquet_items')
      .select('material_id, quantity')
      .eq('bouquet_id', b.id);
    setItems(data || []);
    setShowForm(true);
  }

  function addItemRow() {
    setItems([...items, { material_id: materials[0]?.id || '', quantity: 1 }]);
  }

  function updateItemRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  }

  function removeItemRow(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  const liveCost = items.reduce((sum, it) => {
    const m = materials.find((mat) => mat.id === it.material_id);
    return sum + Number(it.quantity || 0) * (m?.cost_price || 0);
  }, 0);

  async function handleSave(e) {
    e.preventDefault();
    const payload = {
      name: form.name,
      sale_price: Number(form.sale_price),
      description: form.description,
      is_active: form.is_active,
    };

    let bouquetId = form.id;
    if (bouquetId) {
      await supabase.from('bouquets').update(payload).eq('id', bouquetId);
      await supabase.from('bouquet_items').delete().eq('bouquet_id', bouquetId);
    } else {
      const { data, error } = await supabase.from('bouquets').insert(payload).select().single();
      if (error || !data) return;
      bouquetId = data.id;
    }

    const rows = items
      .filter((it) => it.material_id && Number(it.quantity) > 0)
      .map((it) => ({ bouquet_id: bouquetId, material_id: it.material_id, quantity: Number(it.quantity) }));

    if (rows.length > 0) {
      await supabase.from('bouquet_items').insert(rows);
    }

    setShowForm(false);
    loadBouquets();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цей букет?')) return;
    await supabase.from('bouquets').delete().eq('id', id);
    loadBouquets();
  }

  return (
    <ProtectedPage ownerOnly>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-forest">Букети</h1>
        <button
          onClick={openNew}
          className="bg-rose text-white text-sm px-4 py-2 rounded hover:bg-rose/90 transition-colors"
          disabled={materials.length === 0}
        >
          + Додати букет
        </button>
      </div>
      <div className="stem-divider w-16 mb-8" />

      {materials.length === 0 && (
        <p className="text-amber text-sm mb-6">
          Спочатку додайте хоча б один матеріал у "Залишках" — з них складаються рецепти букетів.
        </p>
      )}

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : bouquets.length === 0 ? (
        <p className="text-sage">Букетів ще немає. Додайте перший.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bouquets.map((b) => {
            const cost = costOf(b);
            const margin = b.sale_price - cost;
            return (
              <div key={b.id} className="bg-white border border-sage/20 rounded p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg text-ink">{b.name}</h3>
                    {!b.is_active && (
                      <span className="text-xs text-sage">(неактивний)</span>
                    )}
                  </div>
                  <div className="space-x-3 text-sm shrink-0">
                    <button onClick={() => openEdit(b)} className="text-forest hover:underline">
                      Редагувати
                    </button>
                    <button onClick={() => handleDelete(b.id)} className="text-rose hover:underline">
                      Видалити
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-sm space-y-1">
                  <p className="text-ink">Ціна продажу: <span className="font-medium">{b.sale_price} ₴</span></p>
                  <p className="text-sage">Собівартість: {cost.toFixed(0)} ₴</p>
                  <p className={margin >= 0 ? 'text-leaf' : 'text-rose'}>
                    Маржа: {margin.toFixed(0)} ₴
                  </p>
                </div>

                {b.bouquet_items?.length > 0 && (
                  <p className="text-xs text-sage mt-3">
                    Склад: {b.bouquet_items.map((it) => `${it.materials?.name} ×${it.quantity}`).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center px-6 z-10 py-8 overflow-y-auto">
          <div className="bg-paper rounded max-w-lg w-full p-6 border border-sage/20">
            <h2 className="font-display text-xl text-forest mb-4">
              {form.id ? 'Редагувати букет' : 'Новий букет'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm text-sage mb-1">Назва</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-sage mb-1">Ціна продажу</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.sale_price}
                    onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                    className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Активний (доступний для продажу)
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Опис</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                />
              </div>

              <div className="border-t border-sage/20 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-sage">Склад букета (рецепт)</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-forest text-sm hover:underline"
                  >
                    + додати інгредієнт
                  </button>
                </div>

                {items.length === 0 && (
                  <p className="text-xs text-sage">Ще не додано жодного інгредієнта.</p>
                )}

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
                        value={it.quantity}
                        onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                        className="w-20 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeItemRow(index)}
                        className="text-rose text-sm px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-sage mt-3">
                  Розрахована собівартість: <span className="text-ink font-medium">{liveCost.toFixed(0)} ₴</span>
                  {' · '}
                  Маржа: <span className={form.sale_price - liveCost >= 0 ? 'text-leaf' : 'text-rose'}>
                    {(form.sale_price - liveCost).toFixed(0)} ₴
                  </span>
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sage text-sm px-4 py-2"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="bg-forest text-white text-sm px-4 py-2 rounded hover:bg-forest/90"
                >
                  Зберегти
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
