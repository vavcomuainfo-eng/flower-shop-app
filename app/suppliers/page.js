'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const emptyForm = { id: null, name: '', phone: '', contact_person: '', notes: '' };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  async function loadSuppliers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true });
    if (!error) setSuppliers(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(s) {
    setForm(s);
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const payload = {
      name: form.name,
      phone: form.phone,
      contact_person: form.contact_person,
      notes: form.notes,
    };

    if (form.id) {
      await supabase.from('suppliers').update(payload).eq('id', form.id);
    } else {
      await supabase.from('suppliers').insert(payload);
    }
    setShowForm(false);
    loadSuppliers();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цього постачальника? Матеріали, прив\'язані до нього, залишаться, але без постачальника.')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    loadSuppliers();
  }

  return (
    <ProtectedPage>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-forest">Постачальники</h1>
        <button
          onClick={openNew}
          className="bg-rose text-white text-sm px-4 py-2 rounded hover:bg-rose/90 transition-colors"
        >
          + Додати постачальника
        </button>
      </div>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : suppliers.length === 0 ? (
        <p className="text-sage">Постачальників ще немає. Додайте першого.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white border border-sage/20 rounded p-5">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg text-ink">{s.name}</h3>
                <div className="space-x-3 text-sm shrink-0">
                  <button onClick={() => openEdit(s)} className="text-forest hover:underline">
                    Редагувати
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="text-rose hover:underline">
                    Видалити
                  </button>
                </div>
              </div>
              {s.contact_person && <p className="text-sm text-sage mt-2">{s.contact_person}</p>}
              {s.phone && <p className="text-sm text-ink mt-1">{s.phone}</p>}
              {s.notes && <p className="text-sm text-sage mt-2 whitespace-pre-wrap">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center px-6 z-10">
          <div className="bg-paper rounded max-w-md w-full p-6 border border-sage/20">
            <h2 className="font-display text-xl text-forest mb-4">
              {form.id ? 'Редагувати постачальника' : 'Новий постачальник'}
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
              <div>
                <label className="block text-sm text-sage mb-1">Контактна особа</label>
                <input
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Телефон</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Нотатки</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                />
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
