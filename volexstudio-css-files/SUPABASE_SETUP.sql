-- VolexStudio deployment schema and security policies.
-- Additive setup for the tables described in the project. Review in a Supabase SQL editor first.
-- Run as the Supabase project owner. Never put the service-role key in browser code.

create extension if not exists pgcrypto;

-- Core tables (created only if absent).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'customer' check (role in ('customer','staff','owner')),
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  rank text not null default 'Artist',
  department text not null default 'ARTIST',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  image_url text,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

-- Additive fields needed by the live site.
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'customer';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

alter table public.staff add column if not exists username text;
alter table public.staff add column if not exists rank text not null default 'Artist';
alter table public.staff add column if not exists department text not null default 'ARTIST';
alter table public.staff add column if not exists active boolean not null default true;
alter table public.staff add column if not exists created_at timestamptz not null default now();

alter table public.products add column if not exists title text not null default 'Untitled artwork';
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists category text not null default 'Anime-inspired';
alter table public.products add column if not exists tag text not null default 'Artwork';
alter table public.products add column if not exists published boolean not null default false;
alter table public.products add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists created_at timestamptz not null default now();

alter table public.enquiries add column if not exists customer_name text not null default '';
alter table public.enquiries add column if not exists customer_contact text not null default '';
alter table public.enquiries add column if not exists delivery text;
alter table public.enquiries add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.enquiries add column if not exists customer_id uuid references auth.users(id) on delete set null;
alter table public.enquiries add column if not exists message text not null default '';
alter table public.enquiries add column if not exists status text not null default 'new';
alter table public.enquiries add column if not exists created_at timestamptz not null default now();

-- For allowing guest enquiries, customer_id must be nullable. NULL is not a privileged identity.
alter table public.enquiries alter column customer_id drop not null;

-- Role checks are SECURITY DEFINER to avoid profile RLS recursion.
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner') $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active = true) $$;

-- Create a basic customer profile for each new auth account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Customer'), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_volex on auth.users;
create trigger on_auth_user_created_volex after insert on auth.users
for each row execute function public.handle_new_user();

-- Prevent a signed-in customer/staff member from changing their own role.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if auth.uid() is not null and auth.uid() = new.id and not public.is_owner() and new.role is distinct from old.role then
    raise exception 'Only the owner can change account roles';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role_volex on public.profiles;
create trigger protect_profile_role_volex before update on public.profiles
for each row execute function public.protect_profile_role();

-- RLS on every browser-accessible table.
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.products enable row level security;
alter table public.enquiries enable row level security;
alter table public.site_settings enable row level security;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.staff to anon, authenticated;
grant insert, update, delete on public.staff to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert on public.enquiries to anon, authenticated;
grant select, update on public.enquiries to authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

-- Drop policy names used by this script so rerunning the file is safe.
drop policy if exists "profiles read own or owner or public staff" on public.profiles;
drop policy if exists "profiles create own customer" on public.profiles;
drop policy if exists "profiles update own or owner" on public.profiles;
drop policy if exists "public reads active staff roster" on public.staff;
drop policy if exists "owner manages staff roster" on public.staff;
drop policy if exists "public reads published products" on public.products;
drop policy if exists "owner manages products" on public.products;
drop policy if exists "guest and customer submit enquiries" on public.enquiries;
drop policy if exists "customer reads own enquiries or team reads all" on public.enquiries;
drop policy if exists "team updates enquiries" on public.enquiries;
drop policy if exists "public reads site settings" on public.site_settings;
drop policy if exists "owner manages site settings" on public.site_settings;

create policy "profiles read own or owner or public staff" on public.profiles
for select to anon, authenticated
using (
  id = auth.uid()
  or (select public.is_owner())
  or exists (select 1 from public.staff s where s.user_id = profiles.id and s.active = true)
);

create policy "profiles create own customer" on public.profiles
for insert to authenticated
with check (id = auth.uid() and role = 'customer');

create policy "profiles update own or owner" on public.profiles
for update to authenticated
using (id = auth.uid() or (select public.is_owner()))
with check (id = auth.uid() or (select public.is_owner()));

create policy "public reads active staff roster" on public.staff
for select to anon, authenticated
using (active = true or (select public.is_owner()) or user_id = auth.uid());

create policy "owner manages staff roster" on public.staff
for all to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

create policy "public reads published products" on public.products
for select to anon, authenticated
using (published = true or (select public.is_owner()));

create policy "owner manages products" on public.products
for all to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

create policy "guest and customer submit enquiries" on public.enquiries
for insert to anon, authenticated
with check (
  (customer_id is null and auth.uid() is null)
  or customer_id = auth.uid()
);

create policy "customer reads own enquiries or team reads all" on public.enquiries
for select to authenticated
using (customer_id = auth.uid() or (select public.is_owner()) or (select public.is_staff()));

create policy "team updates enquiries" on public.enquiries
for update to authenticated
using ((select public.is_owner()) or (select public.is_staff()))
with check ((select public.is_owner()) or (select public.is_staff()));

create policy "public reads site settings" on public.site_settings
for select to anon, authenticated using (true);

create policy "owner manages site settings" on public.site_settings
for all to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

-- Public object delivery, owner-controlled artwork uploads, self-service profile image uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('volex-assets', 'volex-assets', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update set public = true, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif'];

drop policy if exists "public read volex assets" on storage.objects;
drop policy if exists "owner uploads product images" on storage.objects;
drop policy if exists "owner updates product images" on storage.objects;
drop policy if exists "owner deletes product images" on storage.objects;
drop policy if exists "users upload own avatar" on storage.objects;
drop policy if exists "users update own avatar" on storage.objects;
create policy "public read volex assets" on storage.objects for select to anon, authenticated
using (bucket_id = 'volex-assets');
create policy "owner uploads product images" on storage.objects for insert to authenticated
with check (bucket_id = 'volex-assets' and (select public.is_owner()) and (storage.foldername(name))[1] = 'products');
create policy "owner updates product images" on storage.objects for update to authenticated
using (bucket_id = 'volex-assets' and (select public.is_owner()))
with check (bucket_id = 'volex-assets' and (select public.is_owner()));
create policy "owner deletes product images" on storage.objects for delete to authenticated
using (bucket_id = 'volex-assets' and (select public.is_owner()));
create policy "users upload own avatar" on storage.objects for insert to authenticated
with check (bucket_id = 'volex-assets' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "users update own avatar" on storage.objects for update to authenticated
using (bucket_id = 'volex-assets' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text)
with check (bucket_id = 'volex-assets' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

insert into public.site_settings (key, value)
values ('about_text', to_jsonb('VolexStudio is an independent art studio for people who want art that feels personal. We work on anime-inspired drawings, portraits, colour work and custom concepts, with a focus on clear communication and creative detail.'::text))
on conflict (key) do nothing;

-- IMPORTANT: Create your own account through the live site's Sign in -> Create account first.
-- Then run this statement with the exact email used to sign up, replacing the email below.
-- Keep it as a one-time manual owner promotion; never add a public owner-signup option.
-- update public.profiles set role = 'owner' where id = (select id from auth.users where email = 'YOUR_OWNER_EMAIL@example.com');
