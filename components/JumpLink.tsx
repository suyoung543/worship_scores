"use client";

/** 같은 페이지 안의 카드로 부드럽게 이동하되, 위에 고정된 메뉴바 아래로 여유를 두고 멈춥니다.
 *  (CSS scroll-margin은 아이폰 사파리에서 무시될 때가 있어 직접 계산) */
export default function JumpLink({ targetId, className, children }: { targetId: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={(e) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        e.preventDefault();
        const navHeight = (document.querySelector(".nav") as HTMLElement | null)?.offsetHeight ?? 0;
        // 메뉴바 아래로 화면 높이의 15%쯤 여유를 둬서, 목적지가 화면 맨 위에 딱 붙지 않고 위쪽 맥락도 조금 보이게 합니다.
        const gap = Math.round(window.innerHeight * 0.15);
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navHeight - gap, behavior: "smooth" });
      }}
    >
      {children}
    </a>
  );
}
