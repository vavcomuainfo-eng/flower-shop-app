'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const emptyForm = { id: null, name: '', unit: 'шт', quantity: 0, min_quantity: 0, cost_price: 0 };

export default function InventoryPage() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  async function loadMaterials() {
    setLoading(true);
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true });
    if (!error) setMaterials(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadMaterials();
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
    const payload = {
      name: form.name,
      unit: form.unit,
      quantity: Number(form.quantity),
      min_quantity: Number(form.min_quantity),
      cost_price: Number(form.cost_price),
      updated_at: new Date().toISOString(),
    };

    if (form.id) {
      await supabase.from('materials').update(payload).eq('id', form.id);
    } else {
      await supabase.from('materials').insert(payload);
    }
    setShowForm(false);
    loadMaterials();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цю позицію зі складу?')) return;
    await supabase.from('materials').delete().eq('id', id);
    loadMaterials();
  }

  return (
    <ProtectedPage>
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

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : materials.length === 0 ? (
        <p className="text-sage">Тут ще нічого немає. Додайте першу квітку чи матеріал.</p>
      ) : (
        <div className="bg-white border border-sage/20 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-sage border-b border-sage/20">
                <th className="px-4 py-3 font-medium">Назва</th>
                <th className="px-4 py-3 font-medium">Кількість</th>
                <th className="px-4 py-3 font-medium">Од.</th>
                <th className="px-4 py-3 font-medium">Закупівельна ціна</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const low = m.quantity <= m.min_quantity;
                return (
                  <tr key={m.id} className="border-b border-sage/10 last:border-0">
                    <td className="px-4 py-3">{m.name}</td>
                    <td className="px-4 py-3">
                      <span className={low ? 'text-amber font-medium' : 'text-ink'}>
                        {m.quantity}
                      </span>
                      {low && <span className="text-amber text-xs ml-2">мало</span>}
                    </td>
                    <td className="px-4 py-3 text-sage">{m.unit}</td>
                    <td className="px-4 py-3">{m.cost_price} ₴</td>
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
          <div className="bg-paper rounded max-w-md w-full p-6 border border-sage/20">
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
                  <label className="block text-sm text-sage mb-1">Кількість</label>
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
                  <label className="block text-sm text-sage mb-1">Мінімум (поріг)</label>
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
