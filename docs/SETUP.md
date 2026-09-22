# 설정 및 배포 가이드

Worship Scores를 새로 설정하거나(예: 다른 팀용으로 복제), 배포 과정을 다시 참고해야 할 때 보는 상세 가이드입니다.
평소 사용법은 [README.md](../README.md)를 참고하세요.

## 준비물

1. [Supabase](https://supabase.com) 무료 프로젝트 1개
2. 이 프로젝트를 올릴 [Vercel](https://vercel.com) 계정 (무료 플랜으로 충분)

둘 다 회원가입만 하면 바로 쓸 수 있고, 본인 소유라 언제든 백업/이전이 가능합니다.

## 1) Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. 왼쪽 메뉴 **SQL Editor**를 열고 `supabase/schema.sql` 파일의 내용을 전체 복사해 붙여넣은 뒤 실행합니다.
   - 테이블(`songs`, `score_versions`, `score_pages`, `services`, `service_items`)과
     악보 이미지를 저장할 비공개 스토리지 버킷(`scores`)이 만들어집니다.
   - 이미 실행한 적이 있어도 전체를 다시 실행해도 안전합니다 (모두 `if not exists` 형태).
3. 왼쪽 메뉴 **Project Settings → API**에서 다음 두 값을 복사해둡니다.
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role`(=Secret key, `anon`/Publishable key 아님) → `SUPABASE_SERVICE_ROLE_KEY`

> `service_role` 키는 데이터베이스 전체 권한을 가진 키라서 절대 브라우저로 노출되면 안 됩니다.
> 이 앱은 서버(서버 액션/라우트 핸들러)에서만 이 키를 사용하도록 만들어져 있어서 안전합니다.

## 2) 로컬에서 실행해보기 (선택)

```bash
npm install
cp .env.local.example .env.local
# .env.local을 열어 4개 값을 채워넣기
npm run dev
```

`http://localhost:3000` 접속 → 비밀번호 + 내 파트(인도자/메인건반/드럼) 선택하면 끝입니다.

## 3) Vercel에 배포하기

1. 이 폴더를 GitHub 저장소로 올립니다 (Vercel이 GitHub 연동으로 자동 배포해줍니다).
2. [vercel.com](https://vercel.com) → **Add New → Project** → 방금 만든 저장소를 선택합니다.
3. **Environment Variables**에 `.env.local.example`에 있는 4개 값을 각각 넣습니다.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_PASSWORD` — 세션 멤버들에게 공유할 공용 비밀번호
   - `AUTH_SECRET` — 아무 긴 임의 문자열 (예: `openssl rand -hex 32` 결과)
4. **Deploy** 클릭. 몇 분 뒤 `https://프로젝트이름.vercel.app` 링크가 생깁니다.
5. 그 링크를 세션 멤버들에게 공유하고, 각자 접속할 때 비밀번호 + 자기 파트를 선택하면 됩니다.
   - 아이패드 Safari에서는 공유 버튼 → **홈 화면에 추가**로 앱처럼 쓸 수 있습니다.

배포 후에도 이 저장소에 다시 코드를 올리면(push) Vercel이 자동으로 재배포합니다.

## 구조 참고

- `supabase/schema.sql` — DB 테이블 및 스토리지 버킷 정의
- `lib/auth.ts`, `middleware.ts` — 공용 비밀번호 + 파트 선택으로 로그인, 서명된 쿠키로 세션 유지
- `lib/db.ts` — 데이터 조회/저장 (모두 `service_role` 키로 서버에서만 실행)
- `lib/convert.ts` — 브라우저에서 업로드 파일을 A4 세로 JPEG 페이지로 변환 (pdf.js + canvas)
- `lib/actions.ts` — 로그인/콘티/곡/업로드 서버 액션
- `lib/pdf.ts`, `app/api/**/pdf/route.ts` — 저장된 페이지 이미지를 PDF로 합쳐서 내려주는 라우트

## 나중에 더할 만한 것들

- 수정본 히스토리 보기 (지금은 세션별 "최신 수정본"만 표시하고, 예전 버전은 DB에는 남지만 화면엔 안 보여줍니다)
- 카카오 로그인 등으로 개인별 계정 전환
- 곡 삭제, 콘티 복제(지난주 콘티 복사해서 새로 만들기)
