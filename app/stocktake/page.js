'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

export default function StocktakePage() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [stock, setStock] = useState([]); // from get_materials_catalog
  const [actuals, setActuals] = useState({}); // {materialId: actualQty}
  const [notes, setNotes] = useState('');
  const [recentStocktakes, setRecentStocktakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadLocations() {
    const { data, error } = await supabase.from('locations').select('id, name, type').order('type', { ascending: false }).order('name');
    if (!error) {
      setLocations(data || []);
      setLocationId((prev) => prev || data?.[0]?.id || '');
    }
  }

  async function loadStock(locId) {
    if (!locId) return setStock([]);
    const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: locId });
    if (!error) {
      setStock(data || []);
      const init = {};
      (data || []).forEach((m) => (init[m.id] = m.quantity));
      setActuals(init);
    }
  }

  async function loadRecentStocktakes() {
    const { data, error } = await supabase
      .from('stocktakes')
      .select('*, locations(name), stocktake_items(expected_quantity, actual_quantity, materials(name))')
      .order('stocktake_date', { ascending: false })
      .limit(10);
    if (!error) setRecentStocktakes(data || []);
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadLocations();
      await loadRecentStocktakes();
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (locationId) loadStock(locationId);
  }, [locationId]);

  function updateActual(materialId, value) {
    setActuals((prev) => ({ ...prev, [materialId]: value }));
  }

  const changedItems = stock.filter((m) => Number(actuals[m.id]) !== Number(m.quantity));

  async function handleSave() {
    if (!locationId) return;
    if (changedItems.length === 0) {
      setMessage('Немає розбіжностей — усе співпадає з обліком.');
      return;
    }
    setSaving(true);
    setMessage('');

    // Собівартість для оцінки розбіжності (власник має доступ)
    const { data: costData } = await supabase.from('materials').select('id, cost_price');
    const costMap = {};
    (costData || []).forEach((m) => (costMap[m.id] = m.cost_price));

    const { data: stocktake, error: stocktakeError } = await supabase
      .from('stocktakes')
      .insert({ location_id: locationId, notes })
      .select()
      .single();

    if (stocktakeError || !stocktake) {
      setMessage('Помилка при збереженні. Спробуйте ще раз.');
      setSaving(false);
      return;
    }

    const rows = changedItems.map((m) => ({
      stocktake_id: stocktake.id,
      material_id: m.id,
      expected_quantity: m.quantity,
      actual_quantity: Number(actuals[m.id]),
      cost_at_stocktake: Math.abs(Number(actuals[m.id]) - m.quantity) * (costMap[m.id] || 0),
    }));
    await supabase.from('stocktake_items').insert(rows);

    for (const m of changedItems) {
      const diff = Number(actuals[m.id]) - m.quantity;
      await supabase.rpc('restock_material', {
        p_material_id: m.id,
        p_add_quantity: diff,
        p_location_id: locationId,
      });
    }

    setNotes('');
    setMessage('Інвентаризацію завершено, залишки оновлено.');
    setSaving(false);
    loadStock(locationId);
    loadRecentStocktakes();
  }

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Інвентаризація</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex items-end gap-3 mb-4">
              <div>
                <label className="block text-sm text-sage mb-1">Точка</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.type === 'warehouse' ? '📦 ' : '🏬 '}
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-sage mb-1">Нотатка</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-sage mb-3">
              У колонці "Факт" стоїть облікова кількість за замовчуванням — впишіть, скільки нарахували насправді. Змінені рядки підсвічуються.
            </p>

            <div className="bg-white border border-sage/20 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-sage border-b border-sage/20">
                    <th className="px-4 py-3 font-medium">Назва</th>
                    <th className="px-4 py-3 font-medium">За обліком</th>
                    <th className="px-4 py-3 font-medium">Факт</th>
                    <th className="px-4 py-3 font-medium">Різниця</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((m) => {
                    const actual = actuals[m.id] ?? m.quantity;
                    const diff = Number(actual) - Number(m.quantity);
                    const changed = diff !== 0;
                    return (
                      <tr key={m.id} className={`border-b border-sage/10 last:border-0 ${changed ? 'bg-amber/5' : ''}`}>
                        <td className="px-4 py-3">{m.name}</td>
                        <td className="px-4 py-3 text-sage">{m.quantity} {m.unit}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={actual}
                            onChange={(e) => updateActual(m.id, e.target.value)}
                            className={`w-24 border rounded px-2 py-1 bg-white ${
                              changed ? 'border-amber text-ink font-medium' : 'border-sage/40'
                            }`}
                          />
                        </td>
                        <td className={`px-4 py-3 ${diff > 0 ? 'text-leaf' : diff < 0 ? 'text-rose' : 'text-sage'}`}>
                          {diff > 0 ? `+${diff}` : diff}
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
                {saving ? 'Зберігаємо...' : 'Завершити інвентаризацію'}
              </button>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg text-ink mb-3">Останні інвентаризації</h2>
            <div className="space-y-2">
              {recentStocktakes.length === 0 && <p className="text-sage text-sm">Ще не проводились.</p>}
              {recentStocktakes.map((s) => (
                <div key={s.id} className="bg-white border border-sage/20 rounded p-3 text-sm">
                  <div className="flex justify-between text-ink">
                    <span>{new Date(s.stocktake_date).toLocaleDateString('uk-UA')}</span>
                    <span className="text-sage text-xs">{s.locations?.name}</span>
                  </div>
                  <p className="text-sage text-xs mt-1">
                    {s.stocktake_items?.length
                      ? s.stocktake_items
                          .map((it) => `${it.materials?.name}: ${it.expected_quantity}→${it.actual_quantity}`)
                          .join(', ')
                      : 'Розбіжностей не було'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
