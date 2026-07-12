-- =========================================================
-- Схема бази даних для обліку квіткового магазину
-- Виконати цей файл у Supabase → SQL Editor → New query → Run
-- =========================================================

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
  cost_price numeric not null default 0,   -- закупівельна ціна за одиницю
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
