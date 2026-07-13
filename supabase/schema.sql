-- =========================================================
-- Схема бази даних для обліку квіткового магазину
-- Виконати цей файл у Supabase → SQL Editor → New query → Run
-- =========================================================

-- ---------- РОЛІ КОРИСТУВАЧІВ (власник / продавець) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'seller' check (role in ('owner', 'seller')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "read own profile" on profiles
  for select using (auth.uid() = id);

-- Автоматично створює профіль (роль "продавець" за замовчуванням) для кожного нового користувача.
-- Власнику потрібно вручну змінити свою роль на "owner" через Table Editor (див. README).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role) values (new.id, 'seller')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function is_owner() returns boolean as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'owner');
$$ language sql security definer stable;

-- ---------- ПОСТАЧАЛЬНИКИ ----------
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  contact_person text,
  notes text,
  created_at timestamptz default now()
);

-- ---------- МАТЕРІАЛИ / КВІТИ (залишки) ----------
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- напр. "Троянда червона 60см"
  unit text not null default 'шт',    -- шт, м, уп тощо
  quantity numeric not null default 0,
  min_quantity numeric default 0,     -- поріг для "мало на складі"
  cost_price numeric not null default 0,   -- закупівельна ціна за одиницю (бачить лише власник)
  sale_price numeric not null default 0,   -- фіксована роздрібна ціна для прямого продажу (бачить каса)
  supplier_id uuid references suppliers(id) on delete set null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- БУКЕТИ (готові вироби / рецепти) ----------
create table if not exists bouquets (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- напр. "Букет 'Весняний' з 15 троянд"
  sale_price numeric not null default 0,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Рецепт букета: з яких матеріалів і в якій кількості складається
create table if not exists bouquet_items (
  id uuid primary key default gen_random_uuid(),
  bouquet_id uuid not null references bouquets(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null default 1
);

-- ---------- ЗАКУПІВЛІ (надходження від постачальників) ----------
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  purchase_date timestamptz default now(),
  total_cost numeric default 0,
  notes text
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null,
  unit_cost numeric not null
);

-- ---------- ПРОДАЖІ (каса) ----------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  sale_date timestamptz default now(),
  total_amount numeric default 0,
  payment_method text default 'готівка',
  is_delivery boolean default false,
  order_channel text not null default 'store' check (order_channel in ('store', 'own_delivery', 'glovo', 'bolt')),
  external_order_ref text,          -- номер замовлення в Glovo/Bolt для звірки
  delivery_address text,
  delivery_phone text,
  delivery_date timestamptz,
  delivery_fee numeric default 0,
  notes text
);

-- Позиція продажу: або букет (готовий рецепт), або окремий матеріал (напр. поштучна квітка, листівка)
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  bouquet_id uuid references bouquets(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  quantity numeric not null default 1,
  price numeric not null default 0,
  check (bouquet_id is not null or material_id is not null)
);

-- =========================================================
-- Індекси
-- =========================================================
create index if not exists idx_materials_supplier on materials(supplier_id);
create index if not exists idx_bouquet_items_bouquet on bouquet_items(bouquet_id);
create index if not exists idx_bouquet_items_material on bouquet_items(material_id);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);

-- =========================================================
-- Row Level Security: доступ лише для залогінених співробітників
-- =========================================================
alter table suppliers enable row level security;
alter table materials enable row level security;
alter table bouquets enable row level security;
alter table bouquet_items enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['suppliers','materials','bouquets','bouquet_items',
                                'purchases','purchase_items','sales','sale_items'])
  loop
    execute format(
      'create policy "authenticated full access" on %I
       for all using (auth.role() = ''authenticated'')
       with check (auth.role() = ''authenticated'');', t);
  end loop;
end $$;

-- =========================================================
-- Функція: автоматичне списання матеріалів зі складу при продажу букета
-- (викликається з коду після створення sale_item з bouquet_id)
-- =========================================================
create or replace function deduct_stock_for_bouquet(p_bouquet_id uuid, p_qty numeric)
returns void as $$
begin
  update materials m
  set quantity = m.quantity - (bi.quantity * p_qty),
      updated_at = now()
  from bouquet_items bi
  where bi.material_id = m.id
    and bi.bouquet_id = p_bouquet_id;
end;
$$ language plpgsql security definer;

-- Списання зі складу при прямому продажу окремого матеріалу (не букета)
create or replace function deduct_material_stock(p_material_id uuid, p_qty numeric)
returns void as $$
begin
  update materials
  set quantity = quantity - p_qty,
      updated_at = now()
  where id = p_material_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- Обмеження прямого доступу до materials лише власником
-- (бо там зберігається закупівельна ціна — cost_price)
-- =========================================================
drop policy if exists "authenticated full access" on materials;
create policy "owner full access on materials" on materials
  for all using (is_owner()) with check (is_owner());

-- Історія закупівель теж містить ціни — доступ лише власнику
drop policy if exists "authenticated full access" on purchases;
create policy "owner full access on purchases" on purchases
  for all using (is_owner()) with check (is_owner());

drop policy if exists "authenticated full access" on purchase_items;
create policy "owner full access on purchase_items" on purchase_items
  for all using (is_owner()) with check (is_owner());

-- Захист цін навіть при непрямих операціях: продавець ніколи не може
-- встановити чи змінити жодну ціну (закупівельну чи роздрібну), навіть через API-запит напряму
create or replace function protect_cost_price() returns trigger as $$
begin
  if not is_owner() then
    if tg_op = 'UPDATE' then
      new.cost_price := old.cost_price;
      new.sale_price := old.sale_price;
    else
      new.cost_price := 0;
      new.sale_price := 0;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_cost_price_trigger on materials;
create trigger protect_cost_price_trigger
  before insert or update on materials
  for each row execute function protect_cost_price();

-- Безпечний перегляд складу для продавця: жодного стовпця з ціною
create or replace function get_materials_catalog()
returns table(id uuid, name text, unit text, quantity numeric, min_quantity numeric, sale_price numeric)
language sql security definer stable as $$
  select id, name, unit, quantity, min_quantity, sale_price from materials order by name;
$$;

-- Продавець може додати нову позицію асортименту (ціна закупівлі завжди 0,
-- власник заповнює її пізніше в "Залишках")
create or replace function add_material(p_name text, p_unit text, p_quantity numeric, p_min_quantity numeric default 0)
returns uuid
language plpgsql security definer as $$
declare
  new_id uuid;
begin
  insert into materials (name, unit, quantity, min_quantity, cost_price)
  values (p_name, p_unit, p_quantity, p_min_quantity, 0)
  returning id into new_id;
  return new_id;
end;
$$;

-- Продавець може поповнити залишок існуючої позиції, не бачачи й не змінюючи ціну
create or replace function restock_material(p_material_id uuid, p_add_quantity numeric)
returns void
language plpgsql security definer as $$
begin
  update materials
  set quantity = quantity + p_add_quantity, updated_at = now()
  where id = p_material_id;
end;
$$;
