-- Keep the health-signal vocabulary closed at the database boundary. The
-- browser mapper is helpful UX, but direct RPC callers must not be able to
-- persist arbitrary semantic codes that later feed safety decisions.

create or replace function private.valid_red_flag_codes(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or jsonb_typeof(value) <> 'array' then false
    else
      jsonb_array_length(value) <= 12
      and pg_column_size(value) <= 1024
      and not exists (
        select 1
        from jsonb_array_elements(value) as item(element)
        where jsonb_typeof(element) <> 'string'
          or (element #>> '{}') not in (
            'chest_pain',
            'shortness_of_breath',
            'fainting',
            'major_trauma',
            'loss_of_strength',
            'loss_of_sensation',
            'fever',
            'bowel_bladder_change',
            'major_swelling',
            'loss_of_motion',
            'numbness_or_weakness'
          )
      )
      and (
        select count(*) = count(distinct element)
        from jsonb_array_elements(value) as item(element)
      )
  end;
$$;

revoke all on function private.valid_red_flag_codes(jsonb) from public, anon, authenticated;

comment on function private.valid_red_flag_codes(jsonb) is
  'Validates the canonical, closed safety vocabulary used by pain reports.';
