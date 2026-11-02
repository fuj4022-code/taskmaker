-- Run in your own Supabase SQL Editor. Existing Leaf Study data is untouched.
create table if not exists public.taskly_documents (
  id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  constraint taskly_schema check (payload->>'schema' = '2')
);
alter table public.taskly_documents enable row level security;
revoke all on public.taskly_documents from anon;
grant select, insert, update on public.taskly_documents to authenticated;
drop policy if exists "Read own tasks" on public.taskly_documents;
create policy "Read own tasks" on public.taskly_documents for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Insert own tasks" on public.taskly_documents;
create policy "Insert own tasks" on public.taskly_documents for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Update own tasks" on public.taskly_documents;
create policy "Update own tasks" on public.taskly_documents for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
