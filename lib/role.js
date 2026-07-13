import { supabase } from './supabaseClient';

// Повертає роль поточного користувача: 'owner' або 'seller'.
// Якщо профіль ще не створено або сталась помилка — безпечний варіант за замовчуванням: 'seller'.
export async function getMyRole() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !data) return 'seller';
  return data.role;
}
