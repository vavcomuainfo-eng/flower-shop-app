'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getCurrentLocationId } from '@/lib/location';

export default function AssortmentPage() {
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locationId, setLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState({ name: '', unit: 'шт', quantity: 0, min_quantity: 0, category_id: '' });
  const [restockAmounts, setRestockAmounts] = useState({});
  const [message, setMessage] = useState('');

  async function loadMaterials(locId) {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: locId });
    if (!error) setMaterials(data || []);
    setLoading(false);
  }

  useEffect(() => {
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
    });
    if (!error) {
      setNewItem({ name: '', unit: 'шт', quantity: 0, min_quantity: 0, category_id: '' });
      setMessage('Додано.');
      loadMaterials(locationId);
    }
  }

  async function handleRestock(materialId) {
    const amount = Number(restockAmounts[materialId] || 0);
    if (!amount || !locationId) return;
    await supabase.rpc('restock_material', {
      p_material_id: materialId,
      p_add_quantity: amount,
      p_location_id: locationId,
    });
    setRestockAmounts({ ...restockAmounts, [materialId]: '' });
    loadMaterials(locationId);
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
              step="0.01"
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
        <div className="bg-white border border-sage/20 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-sage border-b border-sage/20">
                <th className="px-4 py-3 font-medium">Назва</th>
                <th className="px-4 py-3 font-medium">Зараз</th>
                <th className="px-4 py-3 font-medium">Додати</th>
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
                        <img src={m.image_url} alt="" className="w-8 h-8 rounded object-cover inline-block mr-2 align-middle" />
                      ) : null}
                      {m.name}
                      {m.category_name && <span className="text-xs text-sage ml-2">({m.category_name})</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={low ? 'text-amber font-medium' : 'text-ink'}>
                        {m.quantity} {m.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={restockAmounts[m.id] || ''}
                        onChange={(e) => setRestockAmounts({ ...restockAmounts, [m.id]: e.target.value })}
                        className="w-24 border border-sage/40 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleRestock(m.id)} className="text-forest hover:underline">
                        Поповнити
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedPage>
  );
}
