'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getMyRole } from '@/lib/role';
import Nav from './Nav';

export default function ProtectedPage({ children, ownerOnly = false }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      if (ownerOnly) {
        const role = await getMyRole();
        if (role !== 'owner') {
          router.push('/sales');
          return;
        }
      }
      setChecked(true);
    }
    check();
  }, [router, ownerOnly]);

  if (!checked) {
    return <div className="min-h-screen bg-paper" />;
  }

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
