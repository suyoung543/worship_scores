import Link from "next/link";
import { getSessionMember, SESSION_LABELS } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";

export default async function NavBar({ active }: { active: "services" | "songs" }) {
  const member = await getSessionMember();

  return (
    <div className="nav">
      <div className="nav-inner">
        <div className="nav-tabs">
          <Link href="/services" className={`nav-tab ${active === "services" ? "active" : ""}`}>
            이번 예배
          </Link>
          <Link href="/songs" className={`nav-tab ${active === "songs" ? "active" : ""}`}>
            곡 모음
          </Link>
        </div>
        {member && (
          <div className="nav-member">
            <span>
              나: <strong>{SESSION_LABELS[member]}</strong>
            </span>
            <form action={logoutAction}>
              <button type="submit" className="nav-logout">
                로그아웃
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
