-- Esquema de Mi Semana. Idempotente: se puede ejecutar de nuevo sin romper nada.
-- Pegar completo en el SQL Editor de Supabase y ejecutar.
--
-- Convive con las tablas de logros-tracker en el mismo proyecto: todo lo de
-- esta app usa el prefijo semana_.
--
-- Modelo: una fila por usuario con TODO su estado en jsonb. La columna rev
-- (uuid) da control de concurrencia optimista: el cliente solo puede escribir
-- si el rev que tiene es el que esta en la base; si el celular guardo primero,
-- el update no toca ninguna fila, el PC recarga y reaplica su cambio.

create table if not exists semana_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  rev        uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table semana_state enable row level security;

-- Cada usuario solo ve y escribe su propia fila. auth.uid() es el id del
-- usuario que viene en el token; sin sesion iniciada no calza con nada.

drop policy if exists "semana_state: leer lo propio" on semana_state;
create policy "semana_state: leer lo propio"
  on semana_state for select
  using (auth.uid() = user_id);

drop policy if exists "semana_state: crear lo propio" on semana_state;
create policy "semana_state: crear lo propio"
  on semana_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "semana_state: actualizar lo propio" on semana_state;
create policy "semana_state: actualizar lo propio"
  on semana_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "semana_state: borrar lo propio" on semana_state;
create policy "semana_state: borrar lo propio"
  on semana_state for delete
  using (auth.uid() = user_id);

-- updated_at se mantiene solo: no depende del reloj del telefono.
create or replace function semana_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists semana_state_touch on semana_state;
create trigger semana_state_touch
  before update on semana_state
  for each row execute function semana_touch_updated_at();
