alter table public.organization_app_subscriptions
  add column if not exists exemption_until date,
  add column if not exists exemption_reason text not null default '';

alter table public.admin_client_profiles
  add column if not exists referral_code text,
  add column if not exists referred_by_referral_code text not null default '',
  add column if not exists referred_by_organization_id uuid references public.organizations (id) on delete set null;

create unique index if not exists admin_client_profiles_referral_code_idx
  on public.admin_client_profiles (referral_code)
  where referral_code is not null;

update public.admin_client_profiles p
set referral_code = upper(
  regexp_replace(left(coalesce(o.name, 'CONTADOR'), 8), '[^a-zA-Z0-9]', '', 'g')
  || '-' ||
  left(p.organization_id::text, 6)
)
from public.organizations o
where o.id = p.organization_id
  and p.referral_code is null;

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_organization_id uuid not null references public.organizations (id) on delete cascade,
  referred_organization_id uuid not null references public.organizations (id) on delete cascade,
  application_id text not null,
  reward_amount numeric(12,2) not null default 0,
  reward_type text not null default 'monthly_exemption'
    check (reward_type in ('monthly_exemption', 'discount_credit')),
  status text not null default 'granted'
    check (status in ('pending', 'granted', 'used', 'cancelled')),
  valid_until date,
  created_at timestamptz not null default now()
);

create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards (referrer_organization_id, created_at desc);

create index if not exists referral_rewards_referred_idx
  on public.referral_rewards (referred_organization_id, created_at desc);

alter table public.referral_rewards enable row level security;

drop policy if exists "Members manage own organization app subscriptions" on public.organization_app_subscriptions;
create policy "Members manage own organization app subscriptions" on public.organization_app_subscriptions
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins manage referral rewards" on public.referral_rewards;
create policy "Admins manage referral rewards" on public.referral_rewards
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members read own referral rewards" on public.referral_rewards;
create policy "Members read own referral rewards" on public.referral_rewards
  for select using (
    public.is_org_member(referrer_organization_id)
    or public.is_org_member(referred_organization_id)
  );

create or replace function public.grant_referral_reward(
  buyer_organization_id uuid,
  target_application_id text,
  target_application_name text,
  target_reward_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_id uuid;
  referral_text text;
  reward_valid_until date;
begin
  if not public.is_org_member(buyer_organization_id) and not public.is_admin() then
    raise exception 'Usuario sem acesso a organizacao compradora.';
  end if;

  select referred_by_organization_id, referred_by_referral_code
    into referrer_id, referral_text
  from public.admin_client_profiles
  where organization_id = buyer_organization_id;

  if referrer_id is null and coalesce(referral_text, '') <> '' then
    select organization_id
      into referrer_id
    from public.admin_client_profiles
    where referral_code = upper(trim(referral_text))
      and organization_id <> buyer_organization_id
    limit 1;

    update public.admin_client_profiles
    set referred_by_organization_id = referrer_id,
        updated_at = now()
    where organization_id = buyer_organization_id
      and referrer_id is not null;
  end if;

  if referrer_id is null or referrer_id = buyer_organization_id then
    return;
  end if;

  reward_valid_until := current_date + 30;

  insert into public.referral_rewards (
    referrer_organization_id,
    referred_organization_id,
    application_id,
    reward_amount,
    reward_type,
    status,
    valid_until
  )
  values (
    referrer_id,
    buyer_organization_id,
    target_application_id,
    coalesce(target_reward_amount, 0),
    'monthly_exemption',
    'granted',
    reward_valid_until
  );

  insert into public.organization_app_subscriptions (
    organization_id,
    application_id,
    application_name,
    status,
    monthly_price,
    discount_percent,
    subscription_exempt,
    exemption_until,
    exemption_reason,
    updated_at
  )
  values (
    referrer_id,
    target_application_id,
    target_application_name,
    'ativo',
    coalesce(target_reward_amount, 0),
    100,
    true,
    reward_valid_until,
    'Indicacao convertida em assinatura',
    now()
  )
  on conflict (organization_id, application_id) do update
  set status = 'ativo',
      monthly_price = excluded.monthly_price,
      discount_percent = greatest(public.organization_app_subscriptions.discount_percent, 100),
      subscription_exempt = true,
      exemption_until = greatest(coalesce(public.organization_app_subscriptions.exemption_until, current_date), excluded.exemption_until),
      exemption_reason = excluded.exemption_reason,
      updated_at = now();
end;
$$;

grant execute on function public.grant_referral_reward(uuid, text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
