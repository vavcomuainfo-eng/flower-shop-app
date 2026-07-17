'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';

export default function PurchasesPage() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // [{material_id, quantity, unit_cost}]
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');

  async function loadAll() {
    setLoading(true);
    const [mRes, sRes, wRes] = await Promise.all([
      supabase.from('materials').select('id, name, unit, cost_price').order('name'),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('locations').select('id, name').eq('type', 'warehouse').order('name'),
    ]);
    if (!mRes.error) setMaterials(mRes.data || []);
    if (!sRes.error) setSuppliers(sRes.data || []);
    if (!wRes.error) {
      setWarehouses(wRes.data || []);
      setWarehouseId((prev) => prev || wRes.data?.[0]?.id || '');
    }
    setLoading(false);
  }

  async function loadRecentPurchases() {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, suppliers(name), locations(name), purchase_items(quantity, unit_cost, materials(name))')
      .order('purchase_date', { ascending: false })
      .limit(10);
    if (!error) setRecentPurchases(data || []);
  }

  useEffect(() => {
    loadAll();
    loadRecentPurchases();
  }, []);

  function addItemRow() {
    setItems([...items, { material_id: materials[0]?.id || '', quantity: 1, unit_cost: 0 }]);
  }

  function updateItemRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    if (field === 'material_id') {
      const m = materials.find((mat) => mat.id === value);
      if (m) next[index].unit_cost = m.cost_price;
    }
    setItems(next);
  }

  function removeItemRow(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  function findBestMatch(name) {
    if (!name) return '';
    const lower = name.toLowerCase().trim();
    const found = materials.find(
      (m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase())
    );
    return found?.id || '';
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleScanReceipt(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    setScanNote('');

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: file.type }),
      });
      const data = await res.json();

      if (data.error) {
        setScanNote(`Не вдалося розпізнати: ${data.error}`);
        setScanning(false);
        return;
      }

      const newRows = (data.items || []).map((it) => ({
        material_id: findBestMatch(it.name) || materials[0]?.id || '',
        quantity: it.quantity ?? 1,
        unit_cost: it.unit_price ?? 0,
        _ai_name: it.name,
      }));

      setItems((prev) => [...prev, ...newRows]);
      if (data.supplier_name) {
        const matchedSupplier = suppliers.find((s) =>
          s.name.toLowerCase().includes(data.supplier_name.toLowerCase())
        );
        if (matchedSupplier) setSupplierId(matchedSupplier.id);
      }
      setScanNote(`Розпізнано позицій: ${newRows.length}. Перевірте відповідність товарів і ціни нижче.`);
    } catch {
      setScanNote('Помилка при скануванні. Спробуйте ще раз.');
    }
    setScanning(false);
    e.target.value = '';
  }

  const total = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);

  async function handleSave() {
    if (!warehouseId) {
      setMessage('Спершу додайте центральний склад на сторінці "Магазини".');
      return;
    }
    const validItems = items.filter((it) => it.material_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setMessage('Додайте хоча б одну позицію.');
      return;
    }
    setSaving(true);
    setMessage('');

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({ location_id: warehouseId, supplier_id: supplierId || null, total_cost: total, notes })
      .select()
      .single();

    if (purchaseError || !purchase) {
      setMessage('Помилка при збереженні. Спробуйте ще раз.');
      setSaving(false);
      return;
    }

    const rows = validItems.map((it) => ({
      purchase_id: purchase.id,
      material_id: it.material_id,
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
    }));
    await supabase.from('purchase_items').insert(rows);

    for (const it of validItems) {
      await supabase.from('materials').update({ cost_price: Number(it.unit_cost) }).eq('id', it.material_id);
      await supabase.rpc('restock_material', {
        p_material_id: it.material_id,
        p_add_quantity: Number(it.quantity),
        p_location_id: warehouseId,
      });
    }

    setItems([]);
    setSupplierId('');
    setNotes('');
    setMessage('Склад поповнено.');
    setSaving(false);
    loadAll();
    loadRecentPurchases();
  }

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Поповнення складу</h1>
      <div className="stem-divider w-16 mb-8" />
      <p className="text-xs text-sage mb-6">
        Товар завжди оприбутковується на центральний склад. Щоб розподілити по магазинах — використайте "Переміщення" (буде додано).
      </p>

      {loading ? (
        <p className="text-sage">Завантаження...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white border border-sage/20 rounded p-5">
            <h2 className="font-display text-lg text-ink mb-3">Нове надходження</h2>

            <div className="bg-paper border border-sage/20 rounded p-3 mb-4">
              <label className="inline-flex items-center gap-2 text-sm text-forest cursor-pointer">
                📷 Сканувати чек постачальника (фото)
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleScanReceipt}
                  disabled={scanning}
                  className="hidden"
                />
              </label>
              {scanning && <p className="text-xs text-sage mt-1">Розпізнаємо фото, зачекайте кілька секунд...</p>}
              {scanNote && <p className="text-xs text-sage mt-1">{scanNote}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-sage mb-1">Склад</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  {warehouses.length === 0 && <option value="">— немає складу —</option>}
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-sage mb-1">Постачальник</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full border border-sage/40 rounded px-3 py-2 bg-white text-sm"
                >
                  <option value="">— не вказано —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
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
                <div key={index}>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={it.material_id}
                      onChange={(e) => updateItemRow(index, 'material_id', e.target.value)}
                      className="flex-1 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="кількість"
                      value={it.quantity}
                      onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                      className="w-24 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="ціна/од."
                      value={it.unit_cost}
                      onChange={(e) => updateItemRow(index, 'unit_cost', e.target.value)}
                      className="w-24 border border-sage/40 rounded px-2 py-1.5 bg-white text-sm"
                    />
                    <button onClick={() => removeItemRow(index)} className="text-rose text-sm px-1">
                      ✕
                    </button>
                  </div>
                  {it._ai_name && (
                    <p className="text-xs text-sage pl-1 mt-0.5">
                      З фото: "{it._ai_name}" — перевірте, чи правильно зіставлено з товаром
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-sage/20 mt-4 pt-4 flex items-center justify-between">
              <p className="font-display text-xl text-ink">{total.toFixed(0)} ₴</p>
              <button
                onClick={handleSave}
                disabled={saving || materials.length === 0}
                className="bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 disabled:opacity-50"
              >
                {saving ? 'Зберігаємо...' : 'Оприбуткувати'}
              </button>
            </div>
            {message && <p className="text-sm text-leaf mt-2">{message}</p>}
          </div>

          <div>
            <h2 className="font-display text-lg text-ink mb-3">Останні надходження</h2>
            <div className="space-y-2">
              {recentPurchases.length === 0 && <p className="text-sage text-sm">Надходжень ще не було.</p>}
              {recentPurchases.map((p) => (
                <div key={p.id} className="bg-white border border-sage/20 rounded p-3 text-sm">
                  <div className="flex justify-between text-ink">
                    <span>{new Date(p.purchase_date).toLocaleDateString('uk-UA')}</span>
                    <span className="font-medium">{p.total_cost} ₴</span>
                  </div>
                  {p.locations?.name && <p className="text-sage text-xs mt-1">{p.locations.name}</p>}
                  {p.suppliers?.name && <p className="text-sage text-xs">{p.suppliers.name}</p>}
                  <p className="text-sage text-xs mt-1">
                    {p.purchase_items?.map((it) => `${it.materials?.name} ×${it.quantity}`).join(', ')}
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
