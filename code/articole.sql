-- Blog articles, written and scheduled from the internal panel (/cereri,
-- the "Calendar editorial" tab). Run once in Supabase > SQL Editor.
--
-- Excerpt: the seed rows with the first planned articles are left out.

create table public.articole (
  id uuid primary key default gen_random_uuid(),
  creat_la timestamptz not null default now(),
  actualizat_la timestamptz not null default now(),
  data_publicare date not null,
  nume text not null check (char_length(nume) between 3 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  categorie text not null check (categorie in (
    'sejururi-la-mare', 'city-break', 'balneo', 'exotice', 'sfaturi-practice', 'din-oltenia'
  )),
  stare text not null default 'zero' check (stare in ('zero', 'realizat', 'publicat')),
  cuvinte_cheie text check (cuvinte_cheie is null or char_length(cuvinte_cheie) <= 500),
  cta_servicii boolean not null default false,
  coperta_url text check (coperta_url is null or coperta_url like 'https://%'),
  continut text not null default '' check (char_length(continut) <= 60000)
);

create index articole_data on public.articole (data_publicare);

-- `actualizat_la` updates itself on every change. The site uses it as the
-- "last modified" date of the article.
create or replace function public.articole_actualizat()
returns trigger language plpgsql as $$
begin
  new.actualizat_la := now();
  return new;
end;
$$;

create trigger articole_actualizat
  before update on public.articole
  for each row execute function public.articole_actualizat();

alter table public.articole enable row level security;

-- Logged in staff can read and write everything.
create policy "read authenticated" on public.articole
  for select to authenticated using (true);
create policy "insert authenticated" on public.articole
  for insert to authenticated with check (true);
create policy "update authenticated" on public.articole
  for update to authenticated using (true) with check (true);
create policy "delete authenticated" on public.articole
  for delete to authenticated using (true);

-- The site build reads with the public key and gets ONLY the articles that can
-- be published: state other than zero and the day already reached (Romanian
-- time).
create policy "read published anon" on public.articole
  for select to anon
  using (
    stare in ('realizat', 'publicat')
    and data_publicare <= (now() at time zone 'Europe/Bucharest')::date
  );

-- Covers: public bucket (the site downloads them at build time), written only
-- by staff.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coperti', 'coperti', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "coperti read" on storage.objects
  for select using (bucket_id = 'coperti');
create policy "coperti insert authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'coperti');
create policy "coperti update authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'coperti');
create policy "coperti delete authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'coperti');
