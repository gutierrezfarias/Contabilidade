create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'gutierrezfarias1@hotmail.com',
      'gutierrezfarias7@gmail.com'
    );
$$;

update public.profiles
set role = 'admin'
where id in (
  select id
  from auth.users
  where lower(email) in ('gutierrezfarias1@hotmail.com', 'gutierrezfarias7@gmail.com')
);

drop policy if exists "Admins manage home settings" on public.home_settings;
create policy "Admins manage home settings" on public.home_settings
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "Admins manage home slides" on public.home_slides;
create policy "Admins manage home slides" on public.home_slides
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "Admins manage home banners" on public.home_banners;
create policy "Admins manage home banners" on public.home_banners
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "Admins manage footer groups" on public.home_footer_groups;
create policy "Admins manage footer groups" on public.home_footer_groups
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "Admins manage footer links" on public.home_footer_links;
create policy "Admins manage footer links" on public.home_footer_links
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
