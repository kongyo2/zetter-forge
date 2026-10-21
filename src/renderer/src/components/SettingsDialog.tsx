import type { EditorSettings, SyntaxMode } from "@shared/editorSettings";
import { useEffect, useRef, useState } from "react";

import { TextArea, Toggle } from "./ui";

const SYNTAX_OPTIONS: { value: SyntaxMode; title: string; text: string }[] = [
  { value: "plain", title: "なし", text: "いままでどおりの入力欄です。" },
  {
    value: "markdown",
    title: "Markdown（GitHub 風）",
    text: "見出し・箇条書き・表・打ち消し線・チェックリストを色分けし、``` の中は言語ごとに色分けします。",
  },
  {
    value: "poml",
    title: "POML",
    text: "microsoft/POML のタグを、VS Code の POML 拡張と同じ文法で色分けします。",
  },
];

/** 見本の欄の最初の文章 */
const SAMPLES: Record<Exclude<SyntaxMode, "plain">, string> = {
  markdown: [
    "## 口調",
    "- 一人称は「わたし」",
    "- **敬語は使わない**。~~です・ます~~",
    "",
    "| 場面 | 返し方 |",
    "| --- | --- |",
    "| 朝 | おはよ、{{user}} |",
    "",
    "```mermaid",
    "flowchart LR",
    "  初対面 --> 友だち --> 親友",
    "```",
    "",
  ].join("\n"),
  poml: [
    "<role>あなたは {{user}} の幼なじみです。</role>",
    '<task captionStyle="bold">',
    "  一人称は「わたし」。敬語は使わない。",
    "</task>",
    '<let name="mood" value="\'のんびり\'" />',
    "<output-format>{{mood}}した短い文で返す。</output-format>",
    "",
  ].join("\n"),
};

export function SettingsDialog({
  settings,
  onChange,
  onClose,
}: {
  settings: EditorSettings;
  onChange: (next: EditorSettings) => void;
  onClose: () => void;
}) {
  const [samples, setSamples] = useState(SAMPLES);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const set = (patch: Partial<EditorSettings>) => onChange({ ...settings, ...patch });

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    // 補完の一覧を閉じるときの Esc（入力欄が処理済みにする）では閉じない
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const syntax = settings.syntax;
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <h2 className="modal-title" id="settings-title">
          入力欄の設定
        </h2>
        <div className="settings-body">
          <section className="settings-section">
            <h3>書式</h3>
            <p className="note">
              文章の欄の色分けと入力補助です。保存する文章（Zetter に貼る文章）は変わりません。
            </p>
            <div className="mode-options settings-syntax" role="radiogroup" aria-label="書式">
              {SYNTAX_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={syntax === option.value ? "mode-option is-selected" : "mode-option"}
                >
                  <input
                    type="radio"
                    name="editor-syntax"
                    value={option.value}
                    checked={syntax === option.value}
                    onChange={() => set({ syntax: option.value })}
                  />
                  <span className="mode-dot" aria-hidden="true" />
                  <span className="mode-text">
                    <strong>{option.title}</strong>
                    <span>{option.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
          <section className="settings-section">
            <h3>入力補助</h3>
            <Toggle
              checked={settings.pomlAssist}
              onChange={(checked) => set({ pomlAssist: checked })}
              disabled={syntax !== "poml"}
              title="POML の補完と書き間違いの指摘"
              description="タグ名・属性・属性の値の補完、タグにポインタを置いたときの説明、知らないタグや書き方の誤りの指摘、{{ }} の印。POML の公式パッケージ（pomljs）で調べます。"
            />
            <Toggle
              checked={settings.mermaidAssist}
              onChange={(checked) => set({ mermaidAssist: checked })}
              disabled={syntax !== "markdown"}
              title="Mermaid の入力補助"
              description="```mermaid の中の色分け、図のひな形（Mermaid 公式の例）の補完、書き間違いの指摘。"
            />
            <Toggle
              checked={settings.mermaidPreview}
              onChange={(checked) => set({ mermaidPreview: checked })}
              disabled={syntax !== "markdown"}
              title="Mermaid の図を表示する"
              description="```mermaid のブロックを、入力欄の下に図として描きます。"
            />
          </section>
          {syntax !== "plain" ? (
            <section className="settings-section">
              <h3>見本</h3>
              <p className="note">ここで書き心地を試せます（保存はされません）。</p>
              <TextArea
                key={syntax}
                value={samples[syntax]}
                onChange={(value) => setSamples((current) => ({ ...current, [syntax]: value }))}
                rows={6}
                ariaLabel="書式の見本"
              />
            </section>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
