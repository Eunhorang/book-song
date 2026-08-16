# book-song play counter API

`책이 노래가 될 때` GitHub Pages 사이트의 곡별 전체 누적 재생수를 조회하고 기록하는 Vercel 함수입니다.

## API

- `GET /api/plays`: 01~14번 전체 누적값 조회
- `POST /api/plays`: `{ trackId, eventId, playedSeconds }` 검증 후 원자적 1회 증가
- `OPTIONS /api/plays`: GitHub Pages와 로컬 QA용 CORS 사전 요청

30초 미만, 01~14 이외의 번호, UUID v4가 아닌 이벤트 ID, 허용되지 않은 브라우저 Origin은 거절합니다. 중복 이벤트 ID는 Supabase 기본키와 RPC 함수가 한 번만 반영합니다.

## 환경변수

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

서비스 역할 키는 Vercel의 Sensitive 환경변수에만 보관합니다. 어떤 Supabase 키도 브라우저에 넣거나 Git에 커밋하지 않습니다.

## 데이터베이스

초기 구조는 `supabase/migrations/20260811_create_play_counter.sql`, 10번 확장은 `supabase/migrations/20260811120000_add_track_10_play_counter.sql`, 11번 확장은 `supabase/migrations/20260811144000_add_track_11_play_counter.sql`, 12번 확장은 `supabase/migrations/20260812002000_add_track_12_play_counter.sql`, 13번 확장은 `supabase/migrations/20260812023600_add_track_13_play_counter.sql`, 14번 확장은 `supabase/migrations/20260816193700_add_track_14_play_counter.sql`에 있습니다. 원본 테이블과 `SECURITY DEFINER` 함수의 익명·인증 사용자 권한을 회수하고 `service_role`에만 두 RPC 함수 실행 권한을 부여합니다.

## 검사

```bash
npm run check
```
