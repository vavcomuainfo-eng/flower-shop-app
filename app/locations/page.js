'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

const emptyForm = { id: null, name: '', type: 'shop', address: '', phone: '' };

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    const [lRes, eRes] = await Promise.all([
      supabase.from('locations').select('*').order('type', { ascending: false }).order('name'),
      supabase.rpc('get_all_employees'),
    ]);
    if (!lRes.error) setLocations(lRes.data || []);
    if (!eRes.error) setEmployees(eRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(l) {
    setForm(l);
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const payload = { name: form.name, type: form.type, address: form.address, phone: form.phone };
    if (form.id) {
      await supabase.from('locations').update(payload).eq('id', form.id);
    } else {
      await supabase.from('locations').insert(payload);
    }
    setShowForm(false);
    loadAll();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цю точку? Залишки на ній теж зникнуть.')) return;
    await supabase.from('locations').delete().eq('id', id);
    loadAll();
  }

  async function toggleAssignment(profileId, locationId, isAssigned) {
    if (isAssigned) {
      await supabase.rpc('unassign_employee_location', { p_profile_id: profileId, p_location_id: locationId });
    } else {
      await supabase.rpc('assign_employee_location', { p_profile_id: profileId, p_location_id: locationId });
    }
    loadAll();
  }

  async function toggleRole(profileId, currentRole) {
    const newRole = currentRole === 'owner' ? 'seller' : 'owner';
    if (!confirm(`Змінити роль на "${newRole === 'owner' ? 'власник' : 'продавець'}"?`)) return;
    await supabase.rpc('set_employee_role', { p_profile_id: profileId, p_role: newRole });
    loadAll();
  }

  return (
    <ProtectedPage ownerOnly>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-forest">Магазини</h1>
        <button
          onClick={openNew}
          className="bg-rose text-white text-sm px-4 py-2 rounded hover:bg-rose/90 transition-colors"
        >
          + Додати точку
        </button>
      </div>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            {locations.map((l) => (
              <div key={l.id} className="bg-white border border-sage/20 rounded p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg text-ink">
                      {l.type === 'warehouse' ? '📦 ' : '🏬 '}
                      {l.name}
                    </h3>
                    <p className="text-xs text-sage">{l.type === 'warehouse' ? 'Центральний склад' : 'Магазин'}</p>
                  </div>
                  <div className="space-x-3 text-sm shrink-0">
                    <button onClick={() => openEdit(l)} className="text-forest hover:underline">
                      Редагувати
                    </button>
                    <button onClick={() => handleDelete(l.id)} className="text-rose hover:underline">
                      Видалити
                    </button>
                  </div>
                </div>
                {l.address && <p className="text-sm text-ink mt-2">{l.address}</p>}
                {l.phone && <p className="text-sm text-sage mt-1">{l.phone}</p>}
              </div>
            ))}
            {locations.length === 0 && (
              <p className="text-sage text-sm">
                Точок ще немає. Додайте спершу центральний склад, потім свої 6 магазинів.
              </p>
            )}
          </div>

          <h2 className="font-display text-lg text-ink mb-3">Працівники й доступи</h2>
          {employees.length === 0 ? (
            <p className="text-sage text-sm">
              Працівників ще немає. Створіть їм акаунт у Supabase → Authentication → Users.
            </p>
          ) : (
            <div className="bg-white border border-sage/20 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-sage border-b border-sage/20">
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Роль</th>
                    {locations.map((l) => (
                      <th key={l.id} className="px-3 py-3 font-medium text-center">
                        {l.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-sage/10 last:border-0">
                      <td className="px-4 py-3">{emp.email}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRole(emp.id, emp.role)}
                          className={emp.role === 'owner' ? 'text-forest' : 'text-sage'}
                        >
                          {emp.role === 'owner' ? 'власник' : 'продавець'}
                        </button>
                      </td>
                      {locations.map((l) => {
                        const isAssigned = emp.location_ids?.includes(l.id);
                        return (
                          <td key={l.id} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={emp.role === 'owner' || isAssigned}
                              disabled={emp.role === 'owner'}
                              onChange={() => toggleAssignment(emp.id, l.id, isAssigned)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-sage mt-2">
            Власник завжди має доступ до всіх точок автоматично. Продавцю відмічайте лише ті магазини, де він працює.
          </p>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center px-6 z-10">
          <div className="bg-paper rounded max-w-md w-full p-6 border border-sage/20">
            <h2 className="font-display text-xl text-forest mb-4">
              {form.id ? 'Редагувати точку' : 'Нова точка'}
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
                <label className="block text-sm text-sage mb-1">Тип</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white"
                >
                  <option value="shop">Магазин</option>
                  <option value="warehouse">Центральний склад</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Адреса</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
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
