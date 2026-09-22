import NavBar from "@/components/NavBar";
import { createServiceAction } from "@/lib/actions";
import { upcomingSundayISODate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function NewServicePage() {
  return (
    <>
      <NavBar active="services" />
      <div className="page" style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: 22, marginBottom: 20 }}>새 예배 만들기</h1>

        <form action={createServiceAction} className="stack card">
          <div className="field">
            <label htmlFor="serviceDate">날짜</label>
            <input id="serviceDate" name="serviceDate" type="date" defaultValue={upcomingSundayISODate()} required />
          </div>

          <div className="field">
            <label htmlFor="title">제목 (선택)</label>
            <input id="title" name="title" type="text" placeholder="예: 주일 2부 예배" />
          </div>

          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
            만들기
          </button>
        </form>
      </div>
    </>
  );
}
