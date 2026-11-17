"use client";

import { useState } from "react";
import { keyWithVersion, splitKey } from "@/lib/format";
import VersionInput, { canonicalVersion } from "@/components/VersionInput";
import KeyDropdown, { MANUAL } from "@/components/KeyDropdown";

/**
 * 곡의 버전·키 고르기: 기존 악보는 드롭다운에서, 없는 조합은 "새 버전 또는 새 키 입력"으로 직접.
 * 고른 결과(예: "C(예람워십)")를 hidden input name="key" 로 폼에 실어 보냅니다.
 * 콘티 곡 추가 폼과 콘티 곡의 버전·키 수정에서 함께 씁니다.
 */
export default function VersionKeyPicker({
  keys,
  versionOptions,
  initialKey = "",
}: {
  /** 이 곡에 올라온 악보 키들 (저장된 그대로, 예: ["E", "C(예람워십)"]) */
  keys: string[];
  /** 이 곡에 있는 버전 이름들 (직접 입력 시 추천·맞춤용) */
  versionOptions: string[];
  /** 수정할 때 지금 값 */
  initialKey?: string;
}) {
  const initial = splitKey(initialKey);
  // 드롭다운 값: "" (아직 안 고름) | 저장된 키 그대로 | MANUAL (직접 입력)
  const [choice, setChoice] = useState(initialKey ? (keys.includes(initialKey) ? initialKey : MANUAL) : "");
  const [keyInput, setKeyInput] = useState(initialKey && !keys.includes(initialKey) ? initial.base : "");
  const [versionInput, setVersionInput] = useState(initialKey && !keys.includes(initialKey) ? initial.version : "");

  // 버전별로 묶기 (기본 버전이 맨 앞): [["", [["E","E"]]], ["예람워십", [["C(예람워십)","C"]]]]
  const groupMap = new Map<string, [string, string][]>();
  for (const k of keys) {
    const { base, version } = splitKey(k);
    groupMap.set(version, [...(groupMap.get(version) ?? []), [k, base]]);
  }
  const groups = Array.from(groupMap).sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "ko")));

  const hasKeys = groups.length > 0;
  const manual = !hasKeys || choice === MANUAL;
  const key = manual
    ? keyInput.trim()
      ? keyWithVersion(keyInput, canonicalVersion(versionInput, versionOptions))
      : ""
    : choice;

  return (
    <>
      <input type="hidden" name="key" value={key} />
      {hasKeys && (
        <KeyDropdown
          value={choice}
          onChange={(v) => {
            setChoice(v);
            // 직접 입력으로 바꾸면 빈칸에서 시작
            setKeyInput("");
            setVersionInput("");
          }}
          groups={groups}
        />
      )}
      {manual && (
        <div className="version-key-row" style={hasKeys ? { marginTop: 4 } : undefined}>
          <div className="field">
            <label className="sub-label">버전 (선택)</label>
            <VersionInput value={versionInput} onChange={setVersionInput} options={versionOptions} suggestWhenEmpty={false} />
          </div>
          <div className="field">
            <label className="sub-label">키</label>
            <input type="text" placeholder="예: D" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          </div>
        </div>
      )}
    </>
  );
}
