'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const emptyForm = { id: null, name: '', phone: '', email: '', notes: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [history, setHistory] = useState({}); // {customerId: {count, total, lastDate}}
  const [loading, setLoading] = useState(true);

  async function loadCustomers() {
    setLoading(true);
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (!error) setCustomers(data || []);

    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('customer_id, total_amount, sale_date')
      .not('customer_id', 'is', null);
    if (!salesError) {
      const map = {};
      (sales || []).forEach((s) => {
        if (!map[s.customer_id]) map[s.customer_id] = { count: 0, total: 0, lastDate: s.sale_date };
        map[s.customer_id].count += 1;
        map[s.customer_id].total += Number(s.total_amount);
        if (new Date(s.sale_date) > new Date(map[s.customer_id].lastDate)) {
          map[s.customer_id].lastDate = s.sale_date;
        }
      });
      setHistory(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c) {
    setForm(c);
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const payload = { name: form.name, phone: form.phone, email: form.email, notes: form.notes };
    if (form.id) {
      await supabase.from('customers').update(payload).eq('id', form.id);
    } else {
      await supabase.from('customers').insert(payload);
    }
    setShowForm(false);
    loadCustomers();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цього клієнта?')) return;
    await supabase.from('customers').delete().eq('id', id);
    loadCustomers();
  }

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search)
  );

  return (
    <ProtectedPage>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-forest">Клієнти</h1>
        <button
          onClick={openNew}
          className="bg-rose text-white text-sm px-4 py-2 rounded hover:bg-rose/90 transition-colors"
        >
          + Додати клієнта
        </button>
      </div>
      <div className="stem-divider w-16 mb-6" />

      <input
        placeholder="Пошук за ім'ям або телефоном..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm border border-sage/40 rounded px-3 py-2 bg-white text-sm mb-6"
      />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sage">Клієнтів ще немає.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const h = history[c.id];
            return (
              <div key={c.id} className="bg-white border border-sage/20 rounded p-5">
                <div className="flex items-start justify-between">
                  <h3 className="font-display text-lg text-ink">{c.name}</h3>
                  <div className="space-x-3 text-sm shrink-0">
                    <button onClick={() => openEdit(c)} className="text-forest hover:underline">
                      Редагувати
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-rose hover:underline">
                      Видалити
                    </button>
                  </div>
                </div>
                {c.phone && <p className="text-sm text-ink mt-1">{c.phone}</p>}
                {c.email && <p className="text-sm text-sage">{c.email}</p>}
                {c.notes && <p className="text-sm text-sage mt-2 whitespace-pre-wrap">{c.notes}</p>}
                <div className="border-t border-sage/10 mt-3 pt-3 text-sm text-sage">
                  {h ? (
                    <>
                      Замовлень: {h.count} · Всього: {h.total.toFixed(0)} ₴ · Останнє:{' '}
                      {new Date(h.lastDate).toLocaleDateString('uk-UA')}
                    </>
                  ) : (
                    'Ще не було покупок'
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center px-6 z-10">
          <div className="bg-paper rounded max-w-md w-full p-6 border border-sage/20">
            <h2 className="font-display text-xl text-forest mb-4">
              {form.id ? 'Редагувати клієнта' : 'Новий клієнт'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm text-sage mb-1">Ім'я</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                <label className="block text-sm text-sage mb-1">Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
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
