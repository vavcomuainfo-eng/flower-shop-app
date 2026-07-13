'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getMyRole } from '@/lib/role';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError('Невірний email або пароль.');
      return;
    }
    const role = await getMyRole();
    setLoading(false);
    router.push(role === 'owner' ? '/' : '/sales');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-forest mb-1">Квітковий облік</h1>
        <div className="stem-divider w-16 mb-8" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-sage mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-sage/40 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>
          <div>
            <label className="block text-sm text-sage mb-1">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-sage/40 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          {error && <p className="text-rose text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-forest text-white rounded py-2 font-medium hover:bg-forest/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Вхід...' : 'Увійти'}
          </button>
        </form>

        <p className="text-xs text-sage mt-6">
          Користувача створюєте в Supabase → Authentication → Users → Add user.
        </p>
      </div>
    </div>
  );
}
