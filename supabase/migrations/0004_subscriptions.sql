-- ──────────────────────────────────────────────────────────────────────────
-- 0004 — Subscriptions
-- ──────────────────────────────────────────────────────────────────────────
-- Singleton-per-user. Tracks tier and (eventually) Stripe identifiers.
-- For now every user gets tier='free' on signup; real billing wires later.
-- ──────────────────────────────────────────────────────────────────────────

create table public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  tier                   text not null default 'free'
                          check (tier in ('free', 'pro', 'teacher')),
  active                 boolean not null default true,
  expires_at             timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Users read their own subscription state.
create policy "subscriptions_read_own" on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- The signup-time INSERT is allowed (default tier='free'); subsequent
-- writes are restricted to the service_role (Stripe webhook context).
create policy "subscriptions_insert_own" on public.subscriptions
  for insert
  with check (auth.uid() = user_id and tier = 'free');

-- Updates require service_role; standard authenticated role cannot upgrade
-- their own tier via client code (must go through the Stripe webhook).
-- (No policy = denied; service_role bypasses RLS.)
