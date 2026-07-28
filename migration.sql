-- ============================================================
-- 个人投注记录 — Supabase 数据库建表脚本
-- 使用方法：在 Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 同时请关闭邮箱验证：Authentication → Settings → 关掉 "Confirm email"
-- ============================================================

-- 1. 建表：计划（profiles）
create table if not exists profiles (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#3b6ef5',
  created_at timestamptz default now()
);

-- 2. 建表：投注记录（records）
create table if not exists records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  date text not null,
  event text not null,
  amount numeric(12,2) not null default 0,
  odds numeric(8,2) default 0,
  result text not null,
  bonus numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- 3. 开启行级安全（RLS）
alter table profiles enable row level security;
alter table records enable row level security;

-- 4. 计划表的 RLS 策略（用户只能读写自己的数据）
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = user_id);

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = user_id);

create policy "profiles_delete_own" on profiles
  for delete using (auth.uid() = user_id);

-- 5. 记录表的 RLS 策略
create policy "records_select_own" on records
  for select using (auth.uid() = user_id);

create policy "records_insert_own" on records
  for insert with check (auth.uid() = user_id);

create policy "records_update_own" on records
  for update using (auth.uid() = user_id);

create policy "records_delete_own" on records
  for delete using (auth.uid() = user_id);
