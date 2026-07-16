-- =========================================================
-- Схема бази даних для мережі магазинів (квіти, вазони, іграшки, свічки)
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

-- ---------- МАГАЗИНИ ТА ЦЕНТРАЛЬНИЙ СКЛАД ----------
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'shop' check (type in ('shop', 'warehouse')),
  address text,
  phone text,
  created_at timestamptz default now()
);

-- Який працівник до якого магазину має доступ (власник має доступ до всіх завжди)
create table if not exists profile_locations (
  profile_id uuid not null references profiles(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary key (profile_id, location_id)
);

-- ---------- ПОСТАЧАЛЬНИКИ ----------
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  contact_person text,
  notes text,
  created_at timestamptz default now()
);

-- ---------- КАТЕГОРІЇ ТОВАРІВ ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- ---------- МАТЕРІАЛИ / ТОВАРИ (єдиний каталог на всю мережу) ----------
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- напр. "Троянда червона 60см"
  unit text not null default 'шт',    -- шт, м, уп тощо
  category_id uuid references categories(id) on delete set null,
  image_url text,
  cost_price numeric not null default 0,   -- закупівельна ціна за одиницю (бачить лише власник)
  sale_price numeric not null default 0,   -- фіксована роздрібна ціна для прямого продажу (бачить каса)
  supplier_id uuid references suppliers(id) on delete set null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Залишки — окремо для кожного магазину/складу
create table if not exists stock_levels (
  location_id uuid not null references locations(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  quantity numeric not null default 0,
  min_quantity numeric not null default 0,   -- поріг "мало на складі", свій для кожної точки
  updated_at timestamptz default now(),
  primary key (location_id, material_id)
);

-- ---------- БУКЕТИ (готові вироби / рецепти, спільні на всю мережу) ----------
create table if not exists bouquets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sale_price numeric not null default 0,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists bouquet_items (
  id uuid primary key default gen_random_uuid(),
  bouquet_id uuid not null references bouquets(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null default 1
);

-- ---------- ЗАКУПІВЛІ (надходження від постачальників — завжди на центральний склад) ----------
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete set null,
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

-- ---------- ПРОДАЖІ (каса, прив'язана до конкретного магазину) ----------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete set null,
  sale_date timestamptz default now(),
  total_amount numeric default 0,
  payment_method text default 'готівка',
  is_delivery boolean default false,
  order_channel text not null default 'store' check (order_channel in ('store', 'own_delivery', 'glovo', 'bolt')),
  external_order_ref text,
  delivery_address text,
  delivery_phone text,
  delivery_date timestamptz,
  delivery_fee numeric default 0,
  notes text
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  bouquet_id uuid references bouquets(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  quantity numeric not null default 1,
  price numeric not null default 0,
  cost_at_sale numeric not null default 0,
  check (bouquet_id is not null or material_id is not null)
);

-- ---------- ПЕРЕМІЩЕННЯ МІЖ МАГАЗИНАМИ/СКЛАДОМ ----------
create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid references locations(id) on delete set null,
  to_location_id uuid references locations(id) on delete set null,
  transfer_date timestamptz default now(),
  notes text
);

create table if not exists transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references transfers(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null
);

-- ---------- СПИСАННЯ (бій, зів'янення, брак) ----------
create table if not exists write_offs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete set null,
  write_off_date timestamptz default now(),
  reason text not null default 'інше',
  notes text
);

create table if not exists write_off_items (
  id uuid primary key default gen_random_uuid(),
  write_off_id uuid not null references write_offs(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  quantity numeric not null,
  cost_at_writeoff numeric not null default 0
);

-- =========================================================
-- Індекси
-- =========================================================
create index if not exists idx_materials_supplier on materials(supplier_id);
create index if not exists idx_stock_levels_material on stock_levels(material_id);
create index if not exists idx_bouquet_items_bouquet on bouquet_items(bouquet_id);
create index if not exists idx_bouquet_items_material on bouquet_items(material_id);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);
create index if not exists idx_sales_location on sales(location_id);
create index if not exists idx_purchases_location on purchases(location_id);
create index if not exists idx_transfer_items_transfer on transfer_items(transfer_id);
create index if not exists idx_write_off_items_write_off on write_off_items(write_off_id);
create index if not exists idx_write_offs_location on write_offs(location_id);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table suppliers enable row level security;
alter table materials enable row level security;
alter table stock_levels enable row level security;
alter table bouquets enable row level security;
alter table bouquet_items enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table locations enable row level security;
alter table profile_locations enable row level security;
alter table categories enable row level security;
alter table transfers enable row level security;
alter table transfer_items enable row level security;
alter table write_offs enable row level security;
alter table write_off_items enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['suppliers','bouquets','bouquet_items','sales'])
  loop
    execute format(
      'create policy "authenticated full access" on %I
       for all using (auth.role() = ''authenticated'')
       with check (auth.role() = ''authenticated'');', t);
  end loop;
end $$;

-- Магазини: бачити список може будь-хто залогінений (треба обрати свій магазин),
-- створювати/редагувати/видаляти — лише власник
create policy "authenticated can view locations" on locations
  for select using (auth.role() = 'authenticated');
create policy "owner manage locations" on locations
  for insert with check (is_owner());
create policy "owner update locations" on locations
  for update using (is_owner()) with check (is_owner());
create policy "owner delete locations" on locations
  for delete using (is_owner());

-- Прив'язка працівників до магазинів — керує лише власник (через функції нижче)
create policy "owner full access profile_locations" on profile_locations
  for all using (is_owner()) with check (is_owner());

create policy "authenticated can view categories" on categories
  for select using (auth.role() = 'authenticated');
create policy "owner manage categories" on categories
  for insert with check (is_owner());
create policy "owner update categories" on categories
  for update using (is_owner()) with check (is_owner());
create policy "owner delete categories" on categories
  for delete using (is_owner());

create policy "owner full access on transfers" on transfers
  for all using (is_owner()) with check (is_owner());
create policy "owner full access on transfer_items" on transfer_items
  for all using (is_owner()) with check (is_owner());

create policy "owner full access on write_offs" on write_offs
  for all using (is_owner()) with check (is_owner());
create policy "owner full access on write_off_items" on write_off_items
  for all using (is_owner()) with check (is_owner());

-- materials і stock_levels містять/пов'язані з цінами — прямий доступ лише власнику,
-- продавець працює через безпечні функції нижче
create policy "owner full access on materials" on materials
  for all using (is_owner()) with check (is_owner());
create policy "owner full access on stock_levels" on stock_levels
  for all using (is_owner()) with check (is_owner());

create policy "owner full access on purchases" on purchases
  for all using (is_owner()) with check (is_owner());
create policy "owner full access on purchase_items" on purchase_items
  for all using (is_owner()) with check (is_owner());

create policy "owner select sale_items" on sale_items
  for select using (is_owner());
create policy "insert sale_items" on sale_items
  for insert with check (auth.role() = 'authenticated');
create policy "owner update sale_items" on sale_items
  for update using (is_owner()) with check (is_owner());
create policy "owner delete sale_items" on sale_items
  for delete using (is_owner());

-- Захист цін навіть при непрямих операціях
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

-- =========================================================
-- Функції для роботи з магазинами
-- =========================================================

-- Список магазинів, доступних поточному користувачу (власнику — всі, продавцю — лише призначені)
create or replace function get_my_locations()
returns table(id uuid, name text, type text)
language sql security definer stable as $$
  select l.id, l.name, l.type
  from locations l
  where is_owner() or exists (
    select 1 from profile_locations pl where pl.profile_id = auth.uid() and pl.location_id = l.id
  )
  order by (l.type = 'warehouse') desc, l.name;
$$;

create or replace function get_all_employees()
returns table(id uuid, email text, role text, location_ids uuid[])
language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'access denied'; end if;
  return query
  select p.id, u.email::text, p.role,
    coalesce(array_agg(pl.location_id) filter (where pl.location_id is not null), '{}')
  from profiles p
  join auth.users u on u.id = p.id
  left join profile_locations pl on pl.profile_id = p.id
  group by p.id, u.email, p.role
  order by u.email;
end;
$$;

create or replace function assign_employee_location(p_profile_id uuid, p_location_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'access denied'; end if;
  insert into profile_locations (profile_id, location_id) values (p_profile_id, p_location_id)
  on conflict do nothing;
end;
$$;

create or replace function unassign_employee_location(p_profile_id uuid, p_location_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'access denied'; end if;
  delete from profile_locations where profile_id = p_profile_id and location_id = p_location_id;
end;
$$;

create or replace function set_employee_role(p_profile_id uuid, p_role text)
returns void language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'access denied'; end if;
  update profiles set role = p_role where id = p_profile_id;
end;
$$;

-- =========================================================
-- Сховище для фото товарів
-- =========================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public read product images" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "Owner upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and is_owner());
create policy "Owner update product images" on storage.objects
  for update using (bucket_id = 'product-images' and is_owner());
create policy "Owner delete product images" on storage.objects
  for delete using (bucket_id = 'product-images' and is_owner());

-- =========================================================
-- Функції для роботи зі складом (з урахуванням конкретного магазину)
-- =========================================================

create or replace function deduct_stock_for_bouquet(p_bouquet_id uuid, p_qty numeric, p_location_id uuid)
returns void as $$
begin
  insert into stock_levels (location_id, material_id, quantity)
  select p_location_id, bi.material_id, -(bi.quantity * p_qty)
  from bouquet_items bi
  where bi.bouquet_id = p_bouquet_id
  on conflict (location_id, material_id)
  do update set quantity = stock_levels.quantity - (
    select bi2.quantity from bouquet_items bi2
    where bi2.bouquet_id = p_bouquet_id and bi2.material_id = excluded.material_id
  ) * p_qty, updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function deduct_material_stock(p_material_id uuid, p_qty numeric, p_location_id uuid)
returns void as $$
begin
  insert into stock_levels (location_id, material_id, quantity)
  values (p_location_id, p_material_id, -p_qty)
  on conflict (location_id, material_id)
  do update set quantity = stock_levels.quantity - p_qty, updated_at = now();
end;
$$ language plpgsql security definer;

-- Безпечний перегляд складу для продавця (для конкретного магазину), жодного стовпця з ціною закупівлі
create or replace function get_materials_catalog(p_location_id uuid)
returns table(
  id uuid, name text, unit text, quantity numeric, min_quantity numeric, sale_price numeric,
  category_name text, image_url text
)
language sql security definer stable as $$
  select m.id, m.name, m.unit,
    coalesce(sl.quantity, 0), coalesce(sl.min_quantity, 0), m.sale_price,
    c.name, m.image_url
  from materials m
  left join stock_levels sl on sl.material_id = m.id and sl.location_id = p_location_id
  left join categories c on c.id = m.category_id
  order by m.name;
$$;

create or replace function add_material(
  p_name text, p_unit text, p_quantity numeric, p_min_quantity numeric default 0,
  p_location_id uuid default null, p_category_id uuid default null
)
returns uuid
language plpgsql security definer as $$
declare
  new_id uuid;
begin
  insert into materials (name, unit, cost_price, sale_price, category_id)
  values (p_name, p_unit, 0, 0, p_category_id)
  returning id into new_id;

  if p_location_id is not null then
    insert into stock_levels (location_id, material_id, quantity, min_quantity)
    values (p_location_id, new_id, p_quantity, p_min_quantity);
  end if;

  return new_id;
end;
$$;

create or replace function restock_material(p_material_id uuid, p_add_quantity numeric, p_location_id uuid)
returns void
language plpgsql security definer as $$
begin
  insert into stock_levels (location_id, material_id, quantity)
  values (p_location_id, p_material_id, p_add_quantity)
  on conflict (location_id, material_id)
  do update set quantity = stock_levels.quantity + excluded.quantity, updated_at = now();
end;
$$;

-- Фіксує собівартість позицій чека одразу після продажу (за цінами на ЦЮ мить)
create or replace function finalize_sale_costs(p_sale_id uuid)
returns void
language plpgsql security definer as $$
begin
  update sale_items si
  set cost_at_sale = si.quantity * (
    coalesce(
      (select sum(bi.quantity * m.cost_price)
       from bouquet_items bi join materials m on m.id = bi.material_id
       where bi.bouquet_id = si.bouquet_id), 0)
    + coalesce((select cost_price from materials where id = si.material_id), 0)
  )
  where si.sale_id = p_sale_id;
end;
$$;

-- Безпечна історія продажів для каси (без собівартості), можна відфільтрувати по магазину
create or replace function get_recent_sales(p_location_id uuid default null, p_limit int default 15)
returns table(
  id uuid, sale_date timestamptz, total_amount numeric, payment_method text,
  order_channel text, external_order_ref text, items_summary text
)
language sql security definer stable as $$
  select
    s.id, s.sale_date, s.total_amount, s.payment_method, s.order_channel, s.external_order_ref,
    (select string_agg(coalesce(b.name, m.name), ', ')
     from sale_items si
     left join bouquets b on b.id = si.bouquet_id
     left join materials m on m.id = si.material_id
     where si.sale_id = s.id) as items_summary
  from sales s
  where p_location_id is null or s.location_id = p_location_id
  order by s.sale_date desc
  limit p_limit;
$$;

-- =========================================================
-- Звіти (лише власник), з можливістю відфільтрувати по магазину
-- =========================================================
create or replace function get_sales_report(p_from timestamptz, p_to timestamptz, p_location_id uuid default null)
returns table(revenue numeric, cost numeric, write_offs numeric, profit numeric, orders_count bigint)
language plpgsql security definer as $$
declare
  v_revenue numeric;
  v_cost numeric;
  v_write_offs numeric;
begin
  if not is_owner() then raise exception 'access denied'; end if;

  select coalesce(sum(total_amount), 0) into v_revenue from sales
  where sale_date between p_from and p_to and (p_location_id is null or location_id = p_location_id);

  select coalesce(sum(si.cost_at_sale), 0) into v_cost from sale_items si join sales s on s.id = si.sale_id
  where s.sale_date between p_from and p_to and (p_location_id is null or s.location_id = p_location_id);

  select coalesce(sum(woi.cost_at_writeoff), 0) into v_write_offs
  from write_off_items woi join write_offs wo on wo.id = woi.write_off_id
  where wo.write_off_date between p_from and p_to and (p_location_id is null or wo.location_id = p_location_id);

  return query select v_revenue, v_cost, v_write_offs, v_revenue - v_cost - v_write_offs,
    (select count(*) from sales where sale_date between p_from and p_to and (p_location_id is null or location_id = p_location_id));
end;
$$;

create or replace function get_daily_sales(p_from timestamptz, p_to timestamptz, p_location_id uuid default null)
returns table(day date, revenue numeric, cost numeric, write_offs numeric, profit numeric, orders_count bigint)
language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'access denied'; end if;
  return query
  with daily_revenue as (
    select sale_date::date as day, sum(total_amount) as revenue, count(*) as orders_count
    from sales
    where sale_date between p_from and p_to and (p_location_id is null or location_id = p_location_id)
    group by sale_date::date
  ),
  daily_cost as (
    select s.sale_date::date as day, sum(si.cost_at_sale) as cost
    from sale_items si
    join sales s on s.id = si.sale_id
    where s.sale_date between p_from and p_to and (p_location_id is null or s.location_id = p_location_id)
    group by s.sale_date::date
  ),
  daily_writeoffs as (
    select wo.write_off_date::date as day, sum(woi.cost_at_writeoff) as write_offs
    from write_off_items woi
    join write_offs wo on wo.id = woi.write_off_id
    where wo.write_off_date between p_from and p_to and (p_location_id is null or wo.location_id = p_location_id)
    group by wo.write_off_date::date
  )
  select dr.day, dr.revenue, coalesce(dc.cost, 0), coalesce(dw.write_offs, 0),
    dr.revenue - coalesce(dc.cost, 0) - coalesce(dw.write_offs, 0), dr.orders_count
  from daily_revenue dr
  left join daily_cost dc on dc.day = dr.day
  left join daily_writeoffs dw on dw.day = dr.day
  order by dr.day desc;
end;
$$;

create or replace function get_top_bouquets(p_from timestamptz, p_to timestamptz, p_limit int default 5, p_location_id uuid default null)
returns table(name text, qty numeric, revenue numeric)
language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'access denied'; end if;
  return query
  select b.name, sum(si.quantity), sum(si.quantity * si.price)
  from sale_items si
  join sales s on s.id = si.sale_id
  join bouquets b on b.id = si.bouquet_id
  where s.sale_date between p_from and p_to and si.bouquet_id is not null
    and (p_location_id is null or s.location_id = p_location_id)
  group by b.name
  order by 2 desc
  limit p_limit;
end;
$$;
