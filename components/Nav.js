'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getMyRole } from '@/lib/role';

const ownerLinks = [
  { href: '/', label: 'Огляд' },
  { href: '/inventory', label: 'Залишки' },
  { href: '/suppliers', label: 'Постачальники' },
  { href: '/bouquets', label: 'Букети' },
  { href: '/sales', label: 'Продажі' },
];

const sellerLinks = [
  { href: '/sales', label: 'Продажі' },
  { href: '/assortment', label: 'Асортимент' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState(null);

  useEffect(() => {
    getMyRole().then(setRole);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const links = role === 'owner' ? ownerLinks : sellerLinks;

  return (
    <header className="border-b border-sage/30 bg-paper">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="font-display text-xl text-forest">Квітковий облік</div>
        <nav className="flex items-center gap-6">
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
