-- x402vault Postgres schema
-- Safe to run multiple times (IF NOT EXISTS where possible)

create table if not exists uploads (
  upload_id           text primary key,
  object_key          text not null unique,
  filename            text not null,
  content_type        text not null,
  max_bytes           bigint not null,
  paid_amount         numeric(18,6) not null,
  reference           text,
  payment_signature   text,
  uploader_address    text,
  encrypted           boolean not null default false,
  enc_algo            text,
  enc_salt            text,
  enc_nonce           text,
  original_name       text,
  original_type       text,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  used                boolean not null default false,
  actual_size         bigint,
  completed_at        timestamptz,
  checksum_sha256     text,
  s3_key              text
);

create index if not exists idx_uploads_object_key on uploads(object_key);

create table if not exists files (
  id                  text primary key,
  name                text not null,
  size                bigint not null,
  type                text not null,
  uploaded_at         timestamptz not null default now(),
  expires_at          timestamptz,
  max_downloads       integer,
  download_count      integer not null default 0,
  payment_signature   text,
  price_paid          numeric(18,6),
  status              text not null,
  encrypted           boolean not null default false,
  checksum_sha256     text,
  s3_key              text,
  uploader_address    text,
  enc_algo            text,
  enc_salt            text,
  enc_nonce           text,
  original_name       text,
  original_type       text
);

create table if not exists access_tokens (
  token               text primary key,
  file_id             text not null references files(id) on delete cascade,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  used                boolean not null default false
);

create index if not exists idx_access_tokens_file_id on access_tokens(file_id);

-- Non-destructive column additions for existing databases
alter table uploads add column if not exists uploader_address text;
alter table uploads add column if not exists encrypted boolean not null default false;
alter table uploads add column if not exists enc_algo text;
alter table uploads add column if not exists enc_salt text;
alter table uploads add column if not exists enc_nonce text;
alter table uploads add column if not exists original_name text;
alter table uploads add column if not exists original_type text;
alter table files add column if not exists uploader_address text;
alter table files add column if not exists enc_algo text;
alter table files add column if not exists enc_salt text;
alter table files add column if not exists enc_nonce text;
alter table files add column if not exists original_name text;
alter table files add column if not exists original_type text;
create index if not exists idx_files_uploader on files(uploader_address);


