alter table public.whatsapp_channel_configs
  add column if not exists split_long_messages boolean not null default true,
  add column if not exists max_message_chars integer not null default 300,
  add column if not exists split_message_delay_seconds integer not null default 1;

update public.whatsapp_channel_configs
set
  split_long_messages = coalesce(split_long_messages, true),
  max_message_chars = coalesce(max_message_chars, 300),
  split_message_delay_seconds = coalesce(split_message_delay_seconds, 1);
