// 線だけの小さなアイコン。色は文字色（currentColor）に従い、読み上げでは無視させる。
import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconPlus() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  );
}

export function IconUp() {
  return (
    <Icon>
      <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
    </Icon>
  );
}

export function IconDown() {
  return (
    <Icon>
      <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
    </Icon>
  );
}

export function IconRemove() {
  return (
    <Icon>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </Icon>
  );
}

/** 直すもの（Zetter で止められる・上限を超えている） */
export function IconError() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8v3.7" />
      <path d="M8 11.1v.1" strokeWidth={2} />
    </Icon>
  );
}

/** Zetter で保存されないもの・上限が近いもの */
export function IconWarning() {
  return (
    <Icon>
      <path d="M8 2.6 14 13H2Z" />
      <path d="M8 6.6v3" />
      <path d="M8 11.4v.1" strokeWidth={2} />
    </Icon>
  );
}

/** Zetter に写すときの注意 */
export function IconInfo() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.4v3.8" />
      <path d="M8 4.9v.1" strokeWidth={2} />
    </Icon>
  );
}

export function IconCheck() {
  return (
    <Icon>
      <path d="m3.5 8.5 3 3 6-7" />
    </Icon>
  );
}

/** Zetter に貼るためにコピーする */
export function IconCopy() {
  return (
    <Icon>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
    </Icon>
  );
}

/** ファイルをフォルダで見る */
export function IconFolder() {
  return (
    <Icon>
      <path d="M2.5 4.5A1 1 0 0 1 3.5 3.5h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" />
    </Icon>
  );
}
