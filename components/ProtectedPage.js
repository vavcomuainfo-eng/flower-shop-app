'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Nav from './Nav';

export default function ProtectedPage({ children }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setChecked(true);
      }
    });
  }, [router]);

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
