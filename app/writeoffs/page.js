'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { getMyRole } from '@/lib/role';

const REASONS = ['Зів\'янення', 'Злом', 'Брак', 'Інше'];

export default function WriteOffsPage() {
  const [role, setRole] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [locationStock, setLocationStock] = useState([]);
  const [costMap, setCostMap] = useState({});
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // [{material_id, quantity}]
  const [recentWriteOffs, setRecentWriteOffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const isOwner = role === 'owner';

  async function loadLocations() {
    const { data, error } = await supabase.rpc('get_my_locations');
    if (!error) {
      setLocations(data || []);
      setLocationId((prev) => prev || data?.[0]?.id || '');
    }
  }

  async function loadStock(locId) {
    if (!locId) return setLocationStock([]);
    const { data, error } = await supabase.rpc('get_materials_catalog', { p_location_id: locId });
    if (!error) setLocationStock(data || []);
  }

  async function loadCosts() {
    const { data, error } = await supabase.from('materials').select('id, cost_price');
    if (!error) {
      const map = {};
      (data || []).forEach((m) => (map[m.id] = m.cost_price));
      setCostMap(map);
    }
  }

  async function loadRecentWriteOffs() {
    const { data, error } = await supabase
      .from('write_offs')
      .select('*, locations(name), write_off_items(quantity, cost_at_writeoff, materials(name))')
      .order('write_off_date', { ascending: false })
      .limit(10);
    if (!error) setRecentWriteOffs(data || []);
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const r = await getMyRole();
      setRole(r);
      await loadLocations();
      if (r === 'owner') await loadCosts();
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (locationId) loadStock(locationId);
    if (isOwner) loadRecentWriteOffs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, role]);

  function addItemRow() {
    setItems([...items, { material_id: locationStock[0]?.id || '', quantity: 1 }]);
  }

  function updateItemRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  }

  function removeItemRow(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  const totalCost = items.reduce(
    (sum, it) => sum + Number(it.quantity || 0) * (costMap[it.material_id] || 0),
    0
  );

  async function handleSave() {
    if (!locationId) {
      setMessage('Оберіть точку.');
      return;
    }
    const validItems = items.filter((it) => it.material_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setMessage('Додайте хоча б одну позицію.');
      return;
    }
    setSaving(true);
    setMessage('');

    if (isOwner) {
      const { data: writeOff, error: writeOffError } = await supabase
        .from('write_offs')
        .insert({ location_id: locationId, reason, notes })
        .select()
        .single();

      if (writeOffError || !writeOff) {
        setMessage('Помилка при збереженні. Спробуйте ще раз.');
        setSaving(false);
        return;
      }

      const rows = validItems.map((it) => ({
        write_off_id: writeOff.id,
        material_id: it.material_id,
        quantity: Number(it.quantity),
        cost_at_writeoff: Number(it.quantity) * (costMap[it.material_id] || 0),
      }));
      await supabase.from('write_off_items').insert(rows);

      for (const it of validItems) {
        await supabase.rpc('restock_material', {
          p_material_id: it.material_id,
          p_add_quantity: -Number(it.quantity),
          p_location_id: locationId,
        });
      }
      loadRecentWriteOffs();
    } else {
      const { error } = await supabase.rpc('record_write_off', {
        p_location_id: locationId,
        p_reason: reason,
        p_notes: notes,
        p_items: validItems.map((it) => ({ material_id: it.material_id, quantity: Number(it.quantity) })),
      });
      if (error) {
        setMessage('Помилка при збереженні. Спробуйте ще раз.');
        setSaving(false);
        return;
      }
    }

    setItems([]);
    setNotes('');
    setMessage('Списано.');
    setSaving(false);
    loadStock(locationId);
  }

  return (
    <ProtectedPage>
      <h1 className="font-display text-2xl text-forest mb-1">Списання</h1>
      <div className="stem-divider w-16 mb-8" />

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white border border-sage/20 rounded p-5">
            <h2 className="font-display text-lg text-ink mb-3">Нове списання</h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-sage mb-1">Точка</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.type === 'warehouse' ? '📦 ' : '🏬 '}
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Причина</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-sage mb-1">Нотатка</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm mb-4"
              />
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-sage">Товари</label>
              <button onClick={addItemRow} className="text-forest text-sm hover:underline">
                + додати позицію
              </button>
            </div>

            {items.length === 0 && <p className="text-xs text-sage mb-2">Ще нічого не додано.</p>}

            <div className="space-y-2">
              {items.map((it, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <select
                    value={it.material_id}
                    onChange={(e) => updateItemRow(index, 'material_id', e.target.value)}
                    className="flex-1 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  >
                    {locationStock.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (є: {m.quantity} {m.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="кількість"
                    value={it.quantity}
                    onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                    className="w-28 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                  />
                  <button onClick={() => removeItemRow(index)} className="text-rose text-sm px-1">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-sage/20 mt-4 pt-4 flex items-center justify-between">
              {isOwner ? (
                <p className="font-display text-xl text-rose">−{totalCost.toFixed(0)} ₴</p>
              ) : (
                <span />
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 disabled:opacity-50"
              >
                {saving ? 'Списуємо...' : 'Списати'}
              </button>
            </div>
            {message && <p className="text-sm text-leaf mt-2">{message}</p>}
          </div>

          <div>
            {isOwner ? (
              <>
                <h2 className="font-display text-lg text-ink mb-3">Останні списання</h2>
                <div className="space-y-2">
                  {recentWriteOffs.length === 0 && <p className="text-sage text-sm">Списань ще не було.</p>}
                  {recentWriteOffs.map((w) => (
                    <div key={w.id} className="bg-white border border-sage/20 rounded p-3 text-sm">
                      <div className="flex justify-between text-ink">
                        <span>{new Date(w.write_off_date).toLocaleDateString('uk-UA')}</span>
                        <span className="font-medium text-rose">
                          −{w.write_off_items?.reduce((s, it) => s + Number(it.cost_at_writeoff), 0).toFixed(0)} ₴
                        </span>
                      </div>
                      <p className="text-ink text-xs mt-1">
                        {w.locations?.name} · {w.reason}
                      </p>
                      <p className="text-sage text-xs mt-1">
                        {w.write_off_items?.map((it) => `${it.materials?.name} ×${it.quantity}`).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sage text-sm">Історію списань із сумами бачить лише власник.</p>
            )}
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
