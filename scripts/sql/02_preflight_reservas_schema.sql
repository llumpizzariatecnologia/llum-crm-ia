select schema_name
from information_schema.schemata
where schema_name = 'reservas';

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'reservas'
order by table_name;

select
  typnamespace::regnamespace::text as schema_name,
  typname as type_name
from pg_type
where typnamespace::regnamespace::text = 'reservas'
  and typname in ('ticket_status', 'ticket_category', 'reservation_status')
order by typname;
