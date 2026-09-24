"use client";

import { SESSION_LABELS, SESSION_MEMBERS, type SessionMember } from "@/lib/sessions";

export type ScoreType = "original" | SessionMember;

/** 폼 전송용 값으로 변환: 원본이면 kind=original, 세션이면 kind=revision + session. */
export function appendScoreType(formData: FormData, type: ScoreType) {
  if (type === "original") {
    formData.set("kind", "original");
  } else {
    formData.set("kind", "revision");
    formData.set("session", type);
  }
}

export default function ScoreTypeSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: ScoreType;
  onChange: (value: ScoreType) => void;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as ScoreType)}>
      <option value="original">원본</option>
      {SESSION_MEMBERS.map((m) => (
        <option key={m} value={m}>
          {SESSION_LABELS[m]} 수정본
        </option>
      ))}
    </select>
  );
}
