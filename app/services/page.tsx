import Link from "next/link";
import NavBar from "@/components/NavBar";
import { listServices } from "@/lib/db";
import { formatServiceDate } from "@/lib/format";

// 콘티는 자주 바뀌고 로그인 세션에 따라 보이는 내용도 달라지므로 항상 새로 렌더링합니다.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ServicesPage() {
  const services = await listServices();

  return (
    <>
      <NavBar active="services" />
      <div className="page">
        <div className="between" style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24 }}>예배 콘티</h1>
          <Link href="/services/new" className="btn btn-primary">
            + 새 예배
          </Link>
        </div>

        {services.length === 0 ? (
          <div className="empty card">
            <div className="list-title">아직 만든 콘티가 없어요</div>
            <p className="small">새 예배를 만들고 곡을 순서대로 추가해보세요.</p>
          </div>
        ) : (
          <div className="list card">
            {services.map((s) => (
              <Link href={`/services/${s.id}`} key={s.id} className="list-row">
                <div style={{ flex: 1 }}>
                  <div className="list-title">{formatServiceDate(s.service_date)}</div>
                  {s.title && <div className="muted small">{s.title}</div>}
                </div>
                <span className="badge-outline badge">{s.itemCount}곡</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
