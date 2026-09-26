'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getCurrentLocationId } from '@/lib/location';
import { getMyRole } from '@/lib/role';

export default function AssortmentPage() {
  const [role, setRole] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locationId, setLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState({ name: '', unit: 'шт', quantity: 0, min_quantity: 0, category_id: '', sale_price: 0, manufacturer_id: '' });
  const [manufacturers, setManufacturers] = useState([]);
  const [newManufacturerName, setNewManufacturerName] = useState('');
  const [editQuantities, setEditQuantities] = useState({});
  const [editPrices, setEditPrices] = useState({});
  const [message, setMessage] = useState('');
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [zoomedImage, setZoomedImage] = useState(null);

  async function loadMaterials(locId) {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: locId });
    if (!error) setMaterials(data || []);
    setLoading(false);
  }

  useEffect(() => {
    getMyRole().then(setRole);
    const locId = getCurrentLocationId();
    setLocationId(locId);
    if (locId) loadMaterials(locId);
    else setLoading(false);
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (!error) setCategories(data || []);
      });
    supabase
      .from('manufacturers')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (!error) setManufacturers(data || []);
      });
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!locationId) return;
    const { error } = await supabase.rpc('add_material', {
      p_name: newItem.name,
      p_unit: newItem.unit,
      p_quantity: Number(newItem.quantity),
      p_min_quantity: Number(newItem.min_quantity),
      p_location_id: locationId,
      p_category_id: newItem.category_id || null,
      p_sale_price: role === 'admin' ? Number(newItem.sale_price || 0) : 0,
      p_manufacturer_id: newItem.manufacturer_id || null,
    });
    if (!error) {
      setNewItem({ name: '', unit: 'шт', quantity: 0, min_quantity: 0, category_id: '', sale_price: 0, manufacturer_id: '' });
      setMessage('Додано.');
      loadMaterials(locationId);
    }
  }

  async function handleSetExact(materialId) {
    const value = editQuantities[materialId];
    if (value === undefined || value === '') return;
    const { error } = await supabase.rpc('set_stock_quantity', {
      p_material_id: materialId,
      p_location_id: locationId,
      p_quantity: Number(value),
    });
    if (error) {
      alert('Не вдалося зберегти кількість: ' + error.message);
      return;
    }
    setEditQuantities({ ...editQuantities, [materialId]: undefined });
    loadMaterials(locationId);
  }

  async function handleSetPrice(materialId) {
    const value = editPrices[materialId];
    if (value === undefined || value === '') return;
    const { error } = await supabase.rpc('update_material_sale_price', {
      p_material_id: materialId,
      p_new_sale_price: Number(value),
    });
    if (error) {
      alert('Не вдалося зберегти ціну: ' + error.message);
      return;
    }
    setEditPrices({ ...editPrices, [materialId]: undefined });
    loadMaterials(locationId);
  }

  async function handleRemoveFromShop(materialId, name) {
    if (!confirm(`Прибрати "${name}" з цього магазину (кількість стане 0)?`)) return;
    const { error } = await supabase.rpc('set_stock_quantity', {
      p_material_id: materialId,
      p_location_id: locationId,
      p_quantity: 0,
    });
    if (error) {
      alert('Не вдалося прибрати товар: ' + error.message);
      return;
    }
    loadMaterials(locationId);
  }

  async function handleCategoryChange(materialId, categoryId) {
    await supabase.from('materials').update({ category_id: categoryId || null }).eq('id', materialId);
    loadMaterials(locationId);
  }

  async function handleManufacturerChange(materialId, manufacturerId) {
    await supabase.from('materials').update({ manufacturer_id: manufacturerId || null }).eq('id', materialId);
    loadMaterials(locationId);
  }

  async function handleRenameMaterial(materialId) {
    if (!editNameValue.trim()) return;
    const { error } = await supabase.rpc('rename_material', {
      p_material_id: materialId,
      p_new_name: editNameValue.trim(),
    });
    if (!error) {
      setEditingNameId(null);
      loadMaterials(locationId);
    }
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
      const { data: list } = await supabase.from('manufacturers').select('id, name').order('name');
      setManufacturers(list || []);
    }
  }

  async function handleImageUpload(materialId, e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(fileName, file);
    if (!error) {
      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
      await supabase.from('materials').update({ image_url: data.publicUrl }).eq('id', materialId);
      loadMaterials(locationId);
    }
    setUploading(false);
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
      <h1 className="font-display text-2xl text-forest mb-1">Асортимент</h1>
      <div className="stem-divider w-16 mb-8" />

      {role === 'admin' && (
        <div className="flex items-center gap-2 mb-6">
          <input
            placeholder="Новий виробник..."
            value={newManufacturerName}
            onChange={(e) => setNewManufacturerName(e.target.value)}
            className="border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
          />
          <button onClick={handleAddManufacturer} className="text-forest text-sm hover:underline whitespace-nowrap">
            + Додати виробника
          </button>
        </div>
      )}

      <div className="bg-white border border-sage/20 rounded p-5 mb-8">
        <h2 className="font-display text-lg text-ink mb-3">Додати нову позицію</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-sage mb-1">Назва</label>
            <input
              required
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Одиниця</label>
            <input
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Кількість</label>
            <input
              type="number"
              step="1"
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Категорія</label>
            <select
              value={newItem.category_id}
              onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}
              className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
            >
              <option value="">— не вказано —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {role === 'admin' && (
            <>
              <div>
                <label className="block text-xs text-sage mb-1">Роздрібна ціна</label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.sale_price}
                  onChange={(e) => setNewItem({ ...newItem, sale_price: e.target.value })}
                  className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-sage mb-1">Виробник</label>
                <select
                  value={newItem.manufacturer_id}
                  onChange={(e) => setNewItem({ ...newItem, manufacturer_id: e.target.value })}
                  className="w-full border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                >
                  <option value="">— не вказано —</option>
                  {manufacturers.map((mf) => (
                    <option key={mf.id} value={mf.id}>
                      {mf.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <button type="submit" className="bg-forest text-white text-sm px-4 py-2 rounded hover:bg-forest/90">
            Додати
          </button>
        </form>
        {message && <p className="text-leaf text-sm mt-2">{message}</p>}
      </div>

      <h2 className="font-display text-lg text-ink mb-3">Поповнити залишки тут</h2>
      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : materials.length === 0 ? (
        <p className="text-sage">Тут ще нічого немає.</p>
      ) : (
        <div className="bg-white border border-sage/20 rounded overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="text-left text-sage border-b border-sage/20">
                <th className="px-4 py-3 font-medium">Назва</th>
                <th className="px-4 py-3 font-medium">Кількість</th>
                {role === 'admin' && <th className="px-4 py-3 font-medium">Ціна</th>}
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const isZero = Number(m.quantity) === 0;
                const low = !isZero && m.quantity <= m.min_quantity;
                return (
                  <tr key={m.id} className="border-b border-sage/10 last:border-0">
                    <td className="px-4 py-3">
                      {m.image_url ? (
                        <img
                          src={m.image_url}
                          alt=""
                          onClick={() => setZoomedImage(zoomedImage === m.image_url ? null : m.image_url)}
                          className="w-8 h-8 rounded object-cover inline-block mr-2 align-middle cursor-zoom-in"
                        />
                      ) : null}
                      {editingNameId === m.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            className="border border-sage/40 rounded px-2 py-1 bg-white text-sm"
                          />
                          <button
                            onClick={() => handleRenameMaterial(m.id)}
                            className="text-forest text-xs hover:underline"
                          >
                            Зберегти
                          </button>
                          <button onClick={() => setEditingNameId(null)} className="text-sage text-xs">
                            Скасувати
                          </button>
                        </span>
                      ) : (
                        <>
                          {m.name}
                          <button
                            onClick={() => {
                              setEditingNameId(m.id);
                              setEditNameValue(m.name);
                            }}
                            className="text-sage text-xs ml-1 hover:text-forest"
                            title="Виправити назву"
                          >
                            ✏️
                          </button>
                        </>
                      )}
                      {m.sku && <span className="text-xs text-sage font-mono ml-2">[{m.sku}]</span>}
                      {m.category_name && <span className="text-xs text-sage ml-2">({m.category_name})</span>}
                      {role === 'admin' && (
                        <>
                          <button
                            onClick={() => setEditingPhotoId(editingPhotoId === m.id ? null : m.id)}
                            className="text-forest text-xs ml-2 hover:underline"
                          >
                            🖼️ фото/категорія/виробник
                          </button>
                          {editingPhotoId === m.id && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 bg-paper border border-sage/20 rounded p-2">
                              <select
                                value={m.category_id || ''}
                                onChange={(e) => handleCategoryChange(m.id, e.target.value)}
                                className="border border-sage/40 rounded px-2 py-1 bg-white text-xs"
                              >
                                <option value="">— без категорії —</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={m.manufacturer_id || ''}
                                onChange={(e) => handleManufacturerChange(m.id, e.target.value)}
                                className="border border-sage/40 rounded px-2 py-1 bg-white text-xs"
                              >
                                <option value="">— без виробника —</option>
                                {manufacturers.map((mf) => (
                                  <option key={mf.id} value={mf.id}>
                                    {mf.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageUpload(m.id, e)}
                                disabled={uploading}
                                className="text-xs"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="1"
                          value={editQuantities[m.id] ?? m.quantity}
                          onChange={(e) => setEditQuantities({ ...editQuantities, [m.id]: e.target.value })}
                          className={`w-20 border rounded px-2 py-1 bg-white ${
                            isZero ? 'text-rose' : low ? 'text-amber' : 'text-ink'
                          }`}
                        />
                        <span className="text-xs text-sage">{m.unit}</span>
                        {editQuantities[m.id] !== undefined && Number(editQuantities[m.id]) !== Number(m.quantity) && (
                          <button onClick={() => handleSetExact(m.id)} className="text-forest text-xs hover:underline">
                            Зберегти
                          </button>
                        )}
                      </div>
                      {low && <span className="text-amber text-xs">мало</span>}
                    </td>
                    {role === 'admin' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={editPrices[m.id] ?? m.sale_price}
                            onChange={(e) => setEditPrices({ ...editPrices, [m.id]: e.target.value })}
                            className="w-20 border border-sage/40 rounded px-2 py-1 bg-white"
                          />
                          <span className="text-xs text-sage">₴</span>
                          {editPrices[m.id] !== undefined && Number(editPrices[m.id]) !== Number(m.sale_price) && (
                            <button onClick={() => handleSetPrice(m.id)} className="text-forest text-xs hover:underline">
                              Зберегти
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                      <button onClick={() => handleRemoveFromShop(m.id, m.name)} className="text-rose hover:underline">
                        Прибрати
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
