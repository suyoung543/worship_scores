import { loginAction } from "@/lib/actions";
import { SESSION_LABELS, SESSION_MEMBERS } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const next = params.next && params.next.startsWith("/") ? params.next : "/services";

  return (
    <div className="page" style={{ maxWidth: 420, paddingTop: 72 }}>
      <div className="stack" style={{ marginBottom: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 28 }}>Worship Scores</h1>
        <p className="muted">세션 비밀번호와 내 파트를 선택해주세요.</p>
      </div>

      <form action={loginAction} className="stack card">
        <input type="hidden" name="next" value={next} />

        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        </div>

        <div className="field">
          <label>내 파트</label>
          <div className="radio-group">
            {SESSION_MEMBERS.map((member) => (
              <label className="radio-chip" key={member}>
                <input type="radio" name="member" value={member} required />
                <span>{SESSION_LABELS[member]}</span>
              </label>
            ))}
          </div>
        </div>

        {hasError && <p className="error-text">비밀번호가 올바르지 않거나 파트를 선택하지 않았어요.</p>}

        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          들어가기
        </button>
      </form>
    </div>
  );
}
