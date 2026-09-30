'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProtectedPage from '@/components/ProtectedPage';
import { compressImage } from '@/lib/imageCompress';

function extractStoragePath(url) {
  const marker = '/product-images/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export default function OptimizePhotosPage() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [totals, setTotals] = useState({ before: 0, after: 0 });

  function addLog(line) {
    setLog((prev) => [...prev, line]);
  }

  async function handleRun() {
    setRunning(true);
    setLog([]);
    setTotals({ before: 0, after: 0 });

    const { data: materials, error } = await supabase
      .from('materials')
      .select('id, name, image_url')
      .not('image_url', 'is', null);

    if (error || !materials) {
      addLog('Помилка при завантаженні списку товарів: ' + error?.message);
      setRunning(false);
      return;
    }

    setProgress({ done: 0, total: materials.length });
    let beforeTotal = 0;
    let afterTotal = 0;

    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      try {
        const res = await fetch(m.image_url);
        const originalBlob = await res.blob();
        beforeTotal += originalBlob.size;

        // Якщо фото вже маленьке (менше 150 КБ) — вже оптимізоване раніше, пропускаємо
        if (originalBlob.size < 150 * 1024) {
          afterTotal += originalBlob.size;
          addLog(`⏭ "${m.name}" — вже невелике (${(originalBlob.size / 1024).toFixed(0)} КБ), пропущено`);
          setProgress({ done: i + 1, total: materials.length });
          continue;
        }

        const originalFile = new File([originalBlob], 'photo.jpg', { type: originalBlob.type || 'image/jpeg' });
        const compressed = await compressImage(originalFile);
        afterTotal += compressed.size;

        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, compressed, { cacheControl: '604800' });

        if (uploadError) {
          addLog(`✕ "${m.name}" — помилка завантаження: ${uploadError.message}`);
          setProgress({ done: i + 1, total: materials.length });
          continue;
        }

        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
        await supabase.from('materials').update({ image_url: publicUrlData.publicUrl }).eq('id', m.id);

        const oldPath = extractStoragePath(m.image_url);
        if (oldPath) {
          await supabase.storage.from('product-images').remove([oldPath]);
        }

        addLog(
          `✓ "${m.name}" — ${(originalBlob.size / 1024).toFixed(0)} КБ → ${(compressed.size / 1024).toFixed(0)} КБ`
        );
      } catch (err) {
        addLog(`✕ "${m.name}" — помилка: ${err.message}`);
      }
      setProgress({ done: i + 1, total: materials.length });
    }

    setTotals({ before: beforeTotal, after: afterTotal });
    addLog('Готово.');
    setRunning(false);
  }

  return (
    <ProtectedPage ownerOnly>
      <h1 className="font-display text-2xl text-forest mb-1">Оптимізація фото</h1>
      <div className="stem-divider w-16 mb-6" />
      <p className="text-sm text-sage mb-6 max-w-xl">
        Одноразово перестискає всі вже завантажені фото товарів до меншого розміру (так само, як тепер
        роблять нові завантаження). Це зменшить використання трафіку Supabase. Запустіть один раз — старі
        фото замінюються новими, стисненими, а зайве видаляється зі сховища. Можна закрити сторінку й
        повернутись пізніше, якщо процес довгий — просто запустіть ще раз, вже стиснені фото буде пропущено.
      </p>

      <button
        onClick={handleRun}
        disabled={running}
        className="bg-forest text-white text-sm px-5 py-2 rounded hover:bg-forest/90 disabled:opacity-50"
      >
        {running ? `Обробка... ${progress.done}/${progress.total}` : 'Запустити оптимізацію'}
      </button>

      {totals.before > 0 && (
        <p className="text-sm text-leaf mt-4">
          Разом: {(totals.before / 1024 / 1024).toFixed(2)} МБ → {(totals.after / 1024 / 1024).toFixed(2)} МБ
          {' '}(економія {Math.round((1 - totals.after / totals.before) * 100)}%)
        </p>
      )}

      {log.length > 0 && (
        <div className="bg-white border border-sage/20 rounded p-4 mt-4 max-h-96 overflow-y-auto text-sm space-y-1 font-mono">
          {log.map((line, i) => (
            <p key={i} className={line.startsWith('✕') ? 'text-rose' : line.startsWith('⏭') ? 'text-sage' : 'text-ink'}>
              {line}
            </p>
          ))}
        </div>
      )}
    </ProtectedPage>
  );
}
