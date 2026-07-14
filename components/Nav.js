'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getMyRole } from '@/lib/role';
import { getCurrentLocationId, setCurrentLocationId } from '@/lib/location';

const ownerLinks = [
  { href: '/', label: 'Огляд' },
  { href: '/inventory', label: 'Залишки' },
  { href: '/suppliers', label: 'Постачальники' },
  { href: '/purchases', label: 'Поповнення складу' },
  { href: '/bouquets', label: 'Букети' },
  { href: '/reports', label: 'Звіти' },
  { href: '/sales', label: 'Продажі' },
  { href: '/locations', label: 'Магазини' },
];

const sellerLinks = [
  { href: '/sales', label: 'Продажі' },
  { href: '/assortment', label: 'Асортимент' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(null);

  useEffect(() => {
    getMyRole().then(setRole);
    loadLocations();
  }, []);

  async function loadLocations() {
    const { data, error } = await supabase.rpc('get_my_locations');
    if (!error) {
      setLocations(data || []);
      const saved = getCurrentLocationId();
      const validSaved = data?.find((l) => l.id === saved);
      const initial = validSaved ? saved : data?.[0]?.id || null;
      if (initial) {
        setCurrentLocationId(initial);
        setLocationId(initial);
      }
    }
  }

  function handleLocationChange(id) {
    setCurrentLocationId(id);
    setLocationId(id);
    window.location.reload();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const links = role === 'owner' ? ownerLinks : sellerLinks;

  return (
    <header className="border-b border-sage/30 bg-paper">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="font-display text-xl text-forest">Квітковий облік</div>
          {locations.length > 0 && (
            <select
              value={locationId || ''}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="text-sm border border-sage/40 rounded px-2 py-1 bg-white text-ink"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.type === 'warehouse' ? '📦 ' : '🏬 '}
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <nav className="flex items-center gap-5 flex-wrap">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`font-body text-sm pb-1 ${
                  active ? 'text-forest border-b-2 border-rose' : 'text-sage hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="text-sm text-sage hover:text-rose transition-colors"
          >
            Вийти
          </button>
        </nav>
      </div>
    </header>
  );
}
