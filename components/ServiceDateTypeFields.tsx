"use client";

import { useState } from "react";
import { SERVICE_TYPES } from "@/lib/format";

/** 요일 → 예배 종류 (수=수요, 금=금요, 그 외는 기본값 주일) */
function typeForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = y && m && d ? new Date(Date.UTC(y, m - 1, d)).getUTCDay() : 0;
  return day === 3 ? "수요예배" : day === 5 ? "금요예배" : "주일예배";
}

/** 날짜 + 예배 종류. 날짜를 바꾸면 요일에 맞는 예배를 자동으로 골라둡니다 (직접 바꿔도 됨, 기본은 주일). */
export default function ServiceDateTypeFields({ defaultDate, defaultType }: { defaultDate: string; defaultType?: string | null }) {
  // 처음엔 저장된 값, 없으면 주일 (기본값)
  const [type, setType] = useState<string>(defaultType ?? "주일예배");

  return (
    <>
      <div className="field">
        <label htmlFor="serviceDate">날짜</label>
        <input
          id="serviceDate"
          name="serviceDate"
          type="date"
          defaultValue={defaultDate}
          required
          onChange={(e) => setType(typeForDate(e.target.value))}
        />
      </div>

      <div className="field">
        <label>예배</label>
        <div className="radio-group">
          {SERVICE_TYPES.map((t) => (
            <label className="radio-chip" key={t}>
              <input type="radio" name="title" value={t} checked={type === t} onChange={() => setType(t)} required />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
