select count(*) as contacts_total
from public.contacts;

select tenant_id, count(*) as reservations_total
from reservas.reservations
group by tenant_id
order by reservations_total desc;

select tenant_id, payment_status, count(*) as total
from reservas.reservations
group by tenant_id, payment_status
order by tenant_id, payment_status;

select count(*) as tickets_total
from reservas.reservation_tickets;

select id, name, phone, metadata
from reservas.reservations
where contact_id is null
order by created_at desc
limit 50;

select t.id as ticket_id
from reservas.reservation_tickets t
left join reservas.reservations r on r.id = t.reservation_id
where r.id is null
limit 50;

select phone, count(*) as duplicates
from public.contacts
group by phone
having count(*) > 1
order by duplicates desc, phone asc
limit 50;
