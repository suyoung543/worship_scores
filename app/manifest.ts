import type { MetadataRoute } from "next";

// 홈 화면에 추가한 앱의 범위를 사이트 전체("/")로 지정합니다. 이게 없으면 iOS가 추가한 페이지의
// 폴더(예: /services/…)만 앱 범위로 보고, "곡 모음"(/songs)으로 이동하면 상단에 주소창이 뜹니다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Worship Scores",
    short_name: "악보",
    start_url: "/services",
    scope: "/",
    display: "standalone",
    background_color: "#fefcf8",
    theme_color: "#fefcf8",
    icons: [{ src: "/icon.png", sizes: "any", type: "image/png" }],
  };
}
