import NavBar from "@/components/NavBar";
import { createServiceAction } from "@/lib/actions";
import { upcomingSundayISODate } from "@/lib/format";
import ServiceDateTypeFields from "@/components/ServiceDateTypeFields";

export const dynamic = "force-dynamic";

export default function NewServicePage() {
  return (
    <>
      <NavBar active="services" />
      <div className="page" style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: 22, marginBottom: 20 }}>새 예배 만들기</h1>

        <form action={createServiceAction} className="stack card">
          <ServiceDateTypeFields defaultDate={upcomingSundayISODate()} />

          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
            만들기
          </button>
        </form>
      </div>
    </>
  );
}
