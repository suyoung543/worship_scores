-- 악보 DB 스키마
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.

create extension if not exists "pgcrypto";

-- 곡
create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  youtube_url text,
  youtube_label text, -- 어느 찬양팀/버전의 유튜브 링크인지 (예: "마커스 워십")
  created_at timestamptz not null default now()
);

-- 기존에 이 스키마를 이미 실행해서 songs 테이블이 있는 경우를 위한 마이그레이션
alter table songs add column if not exists youtube_label text;

-- 악보 버전: 원본(콘티에서 받은 것) 또는 세션별 수정본
-- 같은 곡이라도 키가 다르면 별도의 원본으로 취급합니다.
create table if not exists score_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  key text not null,
  kind text not null check (kind in ('original', 'revision')),
  session text check (session in ('leader', 'keys', 'drums')),
  memo text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint revision_needs_session check (
    (kind = 'original' and session is null) or
    (kind = 'revision' and session is not null)
  )
);

-- 곡 + 키 조합당 원본은 하나만 존재 (재업로드 시 페이지를 교체)
create unique index if not exists score_versions_one_original
  on score_versions (song_id, key)
  where kind = 'original';

create index if not exists score_versions_song_key_idx
  on score_versions (song_id, key);

create index if not exists score_versions_revision_lookup_idx
  on score_versions (song_id, key, session, created_at desc)
  where kind = 'revision';

-- 악보 버전의 각 페이지 (업로드 시 A4 세로 비율로 변환된 이미지)
create table if not exists score_pages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references score_versions(id) on delete cascade,
  page_no int not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (version_id, page_no)
);

-- 예배 (콘티)
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  title text,
  created_at timestamptz not null default now()
);

-- 예배 콘티에 들어간 곡 순서
create table if not exists service_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  song_id uuid not null references songs(id),
  key text not null,
  position int not null,
  memo text,
  created_at timestamptz not null default now(),
  unique (service_id, position)
);

-- Storage: 악보 이미지 저장용 private 버킷
insert into storage.buckets (id, name, public)
  values ('scores', 'scores', false)
  on conflict (id) do nothing;

-- 이 앱은 Supabase Auth 없이 서버(서비스 롤 키)에서만 DB/Storage에 접근합니다.
-- 클라이언트(브라우저)는 절대 anon key로 직접 접근하지 않으므로 RLS는 기본값(잠금)으로 두어도 안전합니다.
alter table songs enable row level security;
alter table score_versions enable row level security;
alter table score_pages enable row level security;
alter table services enable row level security;
alter table service_items enable row level security;
-- (service_role 키는 RLS를 우회하므로 별도 정책을 추가하지 않습니다.)
