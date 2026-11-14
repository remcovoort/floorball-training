-- Floorball training: scores en keuzestatistieken
-- Plak dit in Supabase > SQL Editor > New query en klik op Run. Je kunt het later
-- opnieuw draaien; bestaande gegevens blijven staan.

-- Scores: één score per oefening per apparaat (opnieuw scoren vervangt de oude score)
create table if not exists public.ratings (
  program     text        not null,
  exercise_id text        not null,
  device_id   uuid        not null,
  score       smallint    not null check (score between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (program, exercise_id, device_id)
);

-- Keuzes: hoe vaak een oefening aan een training wordt toegevoegd
-- (hooguit één keer per oefening per apparaat per dag, zodat aan- en uitklikken niet telt)
create table if not exists public.picks (
  program     text        not null,
  exercise_id text        not null,
  device_id   uuid        not null,
  day         date        not null default current_date,
  created_at  timestamptz not null default now(),
  primary key (program, exercise_id, device_id, day)
);

-- Niemand mag de tabellen rechtstreeks lezen of schrijven; dat gaat alleen via de functies hieronder
alter table public.ratings enable row level security;
alter table public.picks   enable row level security;
revoke all on public.ratings, public.picks from anon, authenticated;

-- Toelichting bij een score (optioneel, hooguit 500 tekens)
alter table public.ratings add column if not exists feedback text check (feedback is null or length(feedback) <= 500);

-- Uit welke app de score of keuze komt: 'training' (trainersapp) of 'gymzaal' (gymzaal-app).
-- Oude regels krijgen 'training'; die kunnen achteraf niet meer worden gesplitst.
alter table public.ratings add column if not exists app text not null default 'training';
alter table public.picks   add column if not exists app text not null default 'training';

drop function if exists public.rate(text, text, uuid, int);
drop function if exists public.rate(text, text, uuid, int, text);
create or replace function public.rate(p_program text, p_exercise text, p_device uuid, p_score int, p_feedback text default null, p_app text default 'training')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_score < 1 or p_score > 5 or length(p_program) > 20 or length(p_exercise) > 60 or length(coalesce(p_feedback, '')) > 500 or length(p_app) > 20 then
    raise exception 'ongeldige score';
  end if;
  insert into ratings (program, exercise_id, device_id, score, feedback, app)
  values (p_program, p_exercise, p_device, p_score, nullif(trim(p_feedback), ''), coalesce(p_app, 'training'))
  on conflict (program, exercise_id, device_id)
  do update set score = excluded.score,
                app = excluded.app,
                feedback = case when p_feedback is null then ratings.feedback else nullif(trim(p_feedback), '') end,
                updated_at = now();
end $$;

drop function if exists public.pick(text, text, uuid);
create or replace function public.pick(p_program text, p_exercise text, p_device uuid, p_app text default 'training')
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_program) > 20 or length(p_exercise) > 60 or length(p_app) > 20 then
    raise exception 'ongeldige keuze';
  end if;
  insert into picks (program, exercise_id, device_id, app)
  values (p_program, p_exercise, p_device, coalesce(p_app, 'training'))
  on conflict do nothing;
end $$;

drop function if exists public.stats(text);
drop function if exists public.stats(text, text);
drop function if exists public.feedback(text);
drop function if exists public.feedback(text, text);

-- Overzicht per oefening: gemiddelde score, aantal stemmen, aantal keer gekozen en door hoeveel apparaten.
-- p_app = null: alle apps samen; 'training' of 'gymzaal': alleen die app.
create or replace function public.stats(p_program text default null, p_app text default null)
returns table (program text, exercise_id text, avg_score numeric, votes int, picks int, pickers int, comments int)
language sql security definer set search_path = public stable as $$
  with r as (
    select program, exercise_id, round(avg(score)::numeric, 2) as avg_score, count(*)::int as votes, count(feedback)::int as comments
    from ratings where (p_program is null or program = p_program) and (p_app is null or app = p_app) group by 1, 2
  ), k as (
    select program, exercise_id, count(*)::int as picks, count(distinct device_id)::int as pickers
    from picks where (p_program is null or program = p_program) and (p_app is null or app = p_app) group by 1, 2
  )
  select coalesce(r.program, k.program), coalesce(r.exercise_id, k.exercise_id),
         r.avg_score, coalesce(r.votes, 0), coalesce(k.picks, 0), coalesce(k.pickers, 0), coalesce(r.comments, 0)
  from r full outer join k on r.program = k.program and r.exercise_id = k.exercise_id;
$$;

-- Alle toelichtingen, nieuwste eerst (voor het overzicht)
create or replace function public.feedback(p_program text default null, p_app text default null)
returns table (program text, exercise_id text, score smallint, feedback text, updated_at timestamptz, app text)
language sql security definer set search_path = public stable as $$
  select program, exercise_id, score, feedback, updated_at, app from ratings
  where feedback is not null and (p_program is null or program = p_program) and (p_app is null or app = p_app)
  order by updated_at desc limit 1000;
$$;

revoke all on function public.rate(text, text, uuid, int, text, text), public.pick(text, text, uuid, text), public.stats(text, text), public.feedback(text, text) from public;
grant execute on function public.rate(text, text, uuid, int, text, text), public.pick(text, text, uuid, text), public.stats(text, text), public.feedback(text, text) to anon, authenticated;
