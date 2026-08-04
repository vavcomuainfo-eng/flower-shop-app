'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getCurrentLocationId } from '@/lib/location';
import { getMyRole } from '@/lib/role';

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
  manufacturer_id: '',
  image_url: '',
};

export default function InventoryPage() {
  const [role, setRole] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [newManufacturerName, setNewManufacturerName] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortValue(m, key) {
    switch (key) {
      case 'name':
        return (m.name || '').toLowerCase();
      case 'category':
        return (m.categories?.name || m.category_name || '').toLowerCase();
      case 'manufacturer':
        return (m.manufacturers?.name || m.manufacturer_name || '').toLowerCase();
      case 'quantity':
        return Number(m.quantity) || 0;
      case 'unit':
        return (m.unit || '').toLowerCase();
      case 'cost_price':
        return Number(m.cost_price) || 0;
      case 'sale_price':
        return Number(m.sale_price) || 0;
      case 'supplier':
        return (m.suppliers?.name || '').toLowerCase();
      default:
        return '';
    }
  }

  function ThSort({ label, field }) {
    const active = sortKey === field;
    return (
      <th
        onClick={() => toggleSort(field)}
        className="px-4 py-3 font-medium cursor-pointer select-none hover:text-forest whitespace-nowrap"
      >
        {label} {active && (sortDir === 'asc' ? '▲' : '▼')}
      </th>
    );
  }
  const [uploading, setUploading] = useState(false);
  const [locationId, setLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  async function loadMaterials(locId, r) {
    setLoading(true);
    if (r === 'owner') {
      const { data, error } = await supabase
        .from('materials')
        .select('*, suppliers(name), categories(name), manufacturers(name), stock_levels(quantity, min_quantity, location_id)')
        .order('name', { ascending: true });
      if (!error) {
        const withStock = (data || []).map((m) => {
          const sl = m.stock_levels?.find((s) => s.location_id === locId);
          return { ...m, quantity: sl?.quantity || 0, min_quantity: sl?.min_quantity || 0 };
        });
        setMaterials(withStock);
      }
    } else {
      const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: locId });
      if (!error) setMaterials(data || []);
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

  async function loadManufacturers() {
    const { data, error } = await supabase.from('manufacturers').select('id, name').order('name');
    if (!error) setManufacturers(data || []);
  }

  async function handleAddManufacturer() {
    if (!newManufacturerName.trim()) return;
    const { data, error } = await supabase
      .from('manufacturers')
      .upsert({ name: newManufacturerName.trim() }, { onConflict: 'name' })
      .select()
      .single();
    if (error) {
      alert('Не вдалося додати виробника: ' + error.message);
      return;
    }
    if (data) {
      setNewManufacturerName('');
      await loadManufacturers();
      setForm((f) => ({ ...f, manufacturer_id: data.id }));
    }
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

  async function handleRenameCategory(id) {
    if (!editingCategoryName.trim()) return;
    await supabase.from('categories').update({ name: editingCategoryName.trim() }).eq('id', id);
    setEditingCategoryId(null);
    loadCategories();
    loadMaterials(locationId, role);
  }

  async function handleDeleteCategory(id) {
    if (!confirm('Видалити цю категорію? У товарів, де вона стояла, категорія стане порожньою.')) return;
    await supabase.from('categories').delete().eq('id', id);
    loadCategories();
    loadMaterials(locationId, role);
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
    async function init() {
      const r = await getMyRole();
      setRole(r);
      const locId = getCurrentLocationId();
      setLocationId(locId);
      if (locId) loadMaterials(locId, r);
      if (r === 'owner') {
        loadSuppliers();
        loadCategories();
        loadManufacturers();
      }
    }
    init();
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
      manufacturer_id: form.manufacturer_id || null,
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
    loadMaterials(locationId, role);
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цю позицію зі складу? Це вплине на всі магазини.')) return;
    await supabase.from('materials').delete().eq('id', id);
    loadMaterials(locationId, role);
  }

  if (!locationId && !loading) {
    return (
      <ProtectedPage>
        <p className="text-sage">Оберіть магазин у шапці зверху.</p>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-forest">Залишки</h1>
        {role === 'owner' && (
          <button
            onClick={openNew}
            className="bg-rose text-white text-sm px-4 py-2 rounded hover:bg-rose/90 transition-colors"
          >
            + Додати позицію
          </button>
        )}
      </div>
      <div className="stem-divider w-16 mb-8" />
      <p className="text-xs text-sage mb-4">
        {role === 'owner'
          ? 'Показано залишки для обраного зараз магазину (перемикач у шапці). Назва, ціни й постачальник — спільні на всю мережу.'
          : 'Перегляд складу для обраного зараз магазину. Редагувати позиції може лише CEO BaB.'}
      </p>

      {role === 'owner' && (
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button
            onClick={() => setShowCategories((v) => !v)}
            className="text-forest text-sm hover:underline"
          >
            {showCategories ? 'Сховати категорії' : 'Керувати категоріями'}
          </button>
          <div className="flex items-center gap-2">
            <input
              placeholder="Новий виробник..."
              value={newManufacturerName}
              onChange={(e) => setNewManufacturerName(e.target.value)}
              className="border border-sage/40 rounded px-2 py-1 bg-white text-sm"
            />
            <button onClick={handleAddManufacturer} className="text-forest text-sm hover:underline whitespace-nowrap">
              + Додати виробника
            </button>
          </div>
        </div>
      )}
      {role === 'owner' && (
        <div className="mb-6">
          {showCategories && (
            <div className="bg-white border border-sage/20 rounded p-4 mt-2 max-w-sm">
              {categories.length === 0 && <p className="text-sage text-sm">Категорій ще немає.</p>}
              <div className="space-y-2">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    {editingCategoryId === c.id ? (
                      <>
                        <input
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          className="flex-1 border border-sage/40 rounded px-2 py-1 bg-white text-sm"
                        />
                        <button onClick={() => handleRenameCategory(c.id)} className="text-forest text-xs hover:underline">
                          Зберегти
                        </button>
                        <button onClick={() => setEditingCategoryId(null)} className="text-sage text-xs">
                          Скасувати
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{c.name}</span>
                        <button
                          onClick={() => {
                            setEditingCategoryId(c.id);
                            setEditingCategoryName(c.name);
                          }}
                          className="text-forest text-xs hover:underline"
                        >
                          Перейменувати
                        </button>
                        <button onClick={() => handleDeleteCategory(c.id)} className="text-rose text-xs hover:underline">
                          Видалити
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : materials.length === 0 ? (
        <p className="text-sage">Тут ще нічого немає. Додайте першу квітку чи товар.</p>
      ) : (
        <div className="bg-white border border-sage/20 rounded overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="text-left text-sage border-b border-sage/20">
                <th className="px-4 py-3 font-medium"></th>
                <ThSort label="Назва" field="name" />
                <ThSort label="Категорія" field="category" />
                <ThSort label="Виробник" field="manufacturer" />
                <ThSort label="Кількість тут" field="quantity" />
                <ThSort label="Од." field="unit" />
                {role === 'owner' && <ThSort label="Закупівельна ціна" field="cost_price" />}
                <ThSort label="Роздрібна ціна" field="sale_price" />
                {role === 'owner' && <ThSort label="Постачальник" field="supplier" />}
                {role === 'owner' && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {(sortKey
                ? [...materials].sort((a, b) => {
                    const va = sortValue(a, sortKey);
                    const vb = sortValue(b, sortKey);
                    if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                    return sortDir === 'asc'
                      ? String(va).localeCompare(String(vb), 'uk')
                      : String(vb).localeCompare(String(va), 'uk');
                  })
                : materials
              ).map((m) => {
                const isZero = Number(m.quantity) === 0;
                const low = !isZero && m.quantity <= m.min_quantity;
                return (
                  <tr key={m.id} className="border-b border-sage/10 last:border-0">
                    <td className="px-4 py-3">
                      {m.image_url ? (
                        <img
                          src={m.image_url}
                          alt={m.name}
                          onClick={() => setZoomedImage(zoomedImage === m.image_url ? null : m.image_url)}
                          className="w-10 h-10 rounded object-cover cursor-zoom-in"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-sage/10" />
                      )}
                    </td>
                    <td className="px-4 py-3">{m.name}</td>
                    <td className="px-4 py-3 text-sage">{m.categories?.name || m.category_name || '—'}</td>
                    <td className="px-4 py-3 text-sage">{m.manufacturers?.name || m.manufacturer_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={isZero ? 'text-rose font-medium' : low ? 'text-amber font-medium' : 'text-ink'}>
                        {m.quantity}
                      </span>
                      {low && <span className="text-amber text-xs ml-2">мало</span>}
                    </td>
                    <td className="px-4 py-3 text-sage">{m.unit}</td>
                    {role === 'owner' && <td className="px-4 py-3">{m.cost_price} ₴</td>}
                    <td className="px-4 py-3">{m.sale_price} ₴</td>
                    {role === 'owner' && <td className="px-4 py-3 text-sage">{m.suppliers?.name || '—'}</td>}
                    {role === 'owner' && (
                      <td className="px-4 py-3 text-right space-x-3">
                        <button onClick={() => openEdit(m)} className="text-forest hover:underline">
                          Редагувати
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="text-rose hover:underline">
                          Видалити
                        </button>
                      </td>
                    )}
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
                    step="1"
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
                    step="1"
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
                <label className="block text-sm text-sage mb-1">Виробник</label>
                <select
                  value={form.manufacturer_id || ''}
                  onChange={(e) => setForm({ ...form, manufacturer_id: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                >
                  <option value="">— не вказано —</option>
                  {manufacturers.map((mf) => (
                    <option key={mf.id} value={mf.id}>
                      {mf.name}
                    </option>
                  ))}
                </select>
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

      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 bg-ink/70 flex items-center justify-center z-20 cursor-zoom-out p-6"
        >
          <img src={zoomedImage} alt="" className="max-w-2xl max-h-[80vh] rounded shadow-xl" />
        </div>
      )}
    </ProtectedPage>
  );
}
