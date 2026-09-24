import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import HelpButton from "@/components/HelpButton";

// content/guide.md 를 읽어 "## 제목" 단위로 나눠 도움말 시트에 넘깁니다. 안내 문구는 md만 고치면 됩니다.
export default function GuideHelp() {
  const raw = fs.readFileSync(path.join(process.cwd(), "content", "guide.md"), "utf-8");
  const body = raw.replace(/^# .*\n/, "");
  const [intro, ...parts] = body.split(/^## /m);

  const sections = parts.map((part) => {
    const newline = part.indexOf("\n");
    return {
      title: part.slice(0, newline).trim(),
      body: <ReactMarkdown>{part.slice(newline + 1).trim()}</ReactMarkdown>,
    };
  });

  return <HelpButton intro={intro.trim() ? <ReactMarkdown>{intro.trim()}</ReactMarkdown> : null} sections={sections} />;
}
