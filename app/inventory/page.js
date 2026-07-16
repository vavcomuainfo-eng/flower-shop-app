'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getCurrentLocationId } from '@/lib/location';

const emptyForm = {
  id: null,
  name: '',
  unit: 'шт',
  quantity: 0,
  min_quantity: 0,
  cost_price: 0,
  sale_price: 0,
  supplier_id: '',
  category_id: '',
  image_url: '',
};

export default function InventoryPage() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [locationId, setLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  async function loadMaterials(locId) {
    setLoading(true);
    const { data, error } = await supabase
      .from('materials')
      .select('*, suppliers(name), categories(name), stock_levels(quantity, min_quantity, location_id)')
      .order('name', { ascending: true });
    if (!error) {
      const withStock = (data || []).map((m) => {
        const sl = m.stock_levels?.find((s) => s.location_id === locId);
        return { ...m, quantity: sl?.quantity || 0, min_quantity: sl?.min_quantity || 0 };
      });
      setMaterials(withStock);
    }
    setLoading(false);
  }

  async function loadSuppliers() {
    const { data, error } = await supabase.from('suppliers').select('id, name').order('name');
    if (!error) setSuppliers(data || []);
  }

  async function loadCategories() {
    const { data, error } = await supabase.from('categories').select('id, name').order('name');
    if (!error) setCategories(data || []);
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: newCategoryName.trim() })
      .select()
      .single();
    if (!error && data) {
      setNewCategoryName('');
      await loadCategories();
      setForm((f) => ({ ...f, category_id: data.id }));
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(fileName, file);
    if (!error) {
      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
    }
    setUploading(false);
  }

  useEffect(() => {
    const locId = getCurrentLocationId();
    setLocationId(locId);
    if (locId) loadMaterials(locId);
    loadSuppliers();
    loadCategories();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(m) {
    setForm(m);
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const materialPayload = {
      name: form.name,
      unit: form.unit,
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
      supplier_id: form.supplier_id || null,
      category_id: form.category_id || null,
      image_url: form.image_url || null,
      updated_at: new Date().toISOString(),
    };

    let materialId = form.id;
    if (materialId) {
      await supabase.from('materials').update(materialPayload).eq('id', materialId);
    } else {
      const { data, error } = await supabase.from('materials').insert(materialPayload).select().single();
      if (error || !data) return;
      materialId = data.id;
    }

    if (locationId) {
      await supabase.from('stock_levels').upsert(
        {
          location_id: locationId,
          material_id: materialId,
          quantity: Number(form.quantity),
          min_quantity: Number(form.min_quantity),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'location_id,material_id' }
      );
    }

    setShowForm(false);
    loadMaterials(locationId);
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цю позицію зі складу? Це вплине на всі магазини.')) return;
    await supabase.from('materials').delete().eq('id', id);
    loadMaterials(locationId);
  }

  if (!locationId && !loading) {
    return (
      <ProtectedPage ownerOnly>
        <p className="text-sage">Оберіть магазин у шапці зверху.</p>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage ownerOnly>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-forest">Залишки</h1>
        <button
          onClick={openNew}
          className="bg-rose text-white text-sm px-4 py-2 rounded hover:bg-rose/90 transition-colors"
        >
          + Додати позицію
        </button>
      </div>
      <div className="stem-divider w-16 mb-8" />
      <p className="text-xs text-sage mb-4">
        Показано залишки для обраного зараз магазину (перемикач у шапці). Назва, ціни й постачальник — спільні на всю мережу.
      </p>

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : materials.length === 0 ? (
        <p className="text-sage">Тут ще нічого немає. Додайте першу квітку чи товар.</p>
      ) : (
        <div className="bg-white border border-sage/20 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-sage border-b border-sage/20">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Назва</th>
                <th className="px-4 py-3 font-medium">Категорія</th>
                <th className="px-4 py-3 font-medium">Кількість тут</th>
                <th className="px-4 py-3 font-medium">Од.</th>
                <th className="px-4 py-3 font-medium">Закупівельна ціна</th>
                <th className="px-4 py-3 font-medium">Роздрібна ціна</th>
                <th className="px-4 py-3 font-medium">Постачальник</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const low = m.quantity <= m.min_quantity;
                return (
                  <tr key={m.id} className="border-b border-sage/10 last:border-0">
                    <td className="px-4 py-3">
                      {m.image_url ? (
                        <img src={m.image_url} alt={m.name} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-sage/10" />
                      )}
                    </td>
                    <td className="px-4 py-3">{m.name}</td>
                    <td className="px-4 py-3 text-sage">{m.categories?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={low ? 'text-amber font-medium' : 'text-ink'}>{m.quantity}</span>
                      {low && <span className="text-amber text-xs ml-2">мало</span>}
                    </td>
                    <td className="px-4 py-3 text-sage">{m.unit}</td>
                    <td className="px-4 py-3">{m.cost_price} ₴</td>
                    <td className="px-4 py-3">{m.sale_price} ₴</td>
                    <td className="px-4 py-3 text-sage">{m.suppliers?.name || '—'}</td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => openEdit(m)} className="text-forest hover:underline">
                        Редагувати
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="text-rose hover:underline">
                        Видалити
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center px-6 z-10">
          <div className="bg-paper rounded max-w-md w-full p-6 border border-sage/20 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl text-forest mb-4">
              {form.id ? 'Редагувати позицію' : 'Нова позиція'}
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
                  <label className="block text-sm text-sage mb-1">Кількість тут</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-sage mb-1">Одиниця</label>
                  <input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-sage mb-1">Мінімум тут (поріг)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.min_quantity}
                    onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
                    className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-sage mb-1">Закупівельна ціна</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">
                  Роздрібна ціна <span className="text-sage">(фіксована на касі, однакова у всіх магазинах)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Категорія</label>
                <select
                  value={form.category_id || ''}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                >
                  <option value="">— не вказано —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 mt-2">
                  <input
                    placeholder="Нова категорія..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 border border-sage/40 rounded px-2 py-1 bg-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="text-forest text-sm hover:underline whitespace-nowrap"
                  >
                    + додати
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-sage mb-1">Фото</label>
                <div className="flex items-center gap-3">
                  {form.image_url ? (
                    <img src={form.image_url} alt="" className="w-14 h-14 rounded object-cover border border-sage/20" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-sage/10" />
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
                </div>
                {uploading && <p className="text-xs text-sage mt-1">Завантаження...</p>}
              </div>

              <div>
                <label className="block text-sm text-sage mb-1">Постачальник</label>
                <select
                  value={form.supplier_id || ''}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                >
                  <option value="">— не вказано —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="text-sage text-sm px-4 py-2">
                  Скасувати
                </button>
                <button type="submit" className="bg-forest text-white text-sm px-4 py-2 rounded hover:bg-forest/90">
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
