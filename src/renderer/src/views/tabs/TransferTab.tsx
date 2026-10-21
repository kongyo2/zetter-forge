// Zetter へ写す。Zetter の作成画面の順に、コピーする文字・画像・選ぶ値を並べた一覧。
import { useLayoutEffect, useRef } from "react";

import type { TransferItemVM, TransferTabVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import { CopyButton, Section } from "../parts/basics";
import { IconCheck, IconFolder, IconWarning } from "../parts/icons";

/** 写す項目 1 つ（その項目の場所の中に置く） */
function Item({ vm }: { vm: TransferItemVM }) {
  const emit = useEmit();
  const ref = useRef<HTMLLIElement | null>(null);
  // いまコピーした項目が見えるようにする（「次の項目をコピー」で進んだとき）
  useLayoutEffect(() => {
    if (vm.flash !== null) ref.current?.scrollIntoView({ block: "nearest" });
  }, [vm.flash]);
  const done = vm.status === "done";
  return (
    <li ref={ref} className={`transfer-item is-${vm.status}`}>
      <div className="transfer-head">
        <span className="transfer-label">{vm.label}</span>
        {vm.status === "skip" ? (
          <span className="transfer-status">{vm.skipLabel}</span>
        ) : (
          <span className={`transfer-status is-${vm.status}`}>
            {done ? <IconCheck /> : vm.status === "changed" ? <IconWarning /> : null}
            {vm.statusLabel}
          </span>
        )}
      </div>
      {vm.status !== "skip" ? (
        <div className="transfer-body">
          {vm.thumbnail ? <img className="transfer-thumb" src={vm.thumbnail} alt="" /> : null}
          <p className={vm.kind === "text" ? "transfer-preview is-text" : "transfer-preview"}>
            {vm.kind === "setting" ? <strong>{vm.preview}</strong> : vm.preview}
            {vm.length ? <span className="transfer-length">{vm.length}</span> : null}
          </p>
          <div className="transfer-actions">
            {vm.copy ? (
              <CopyButton
                vm={vm.copy}
                name={[]}
                label={vm.kind === "image" ? "場所をコピー" : "コピー"}
              />
            ) : null}
            {vm.canShowFile ? (
              <button
                type="button"
                className="btn btn-plain btn-small"
                onClick={() => emit({ type: "show-file", path: [] })}
              >
                <IconFolder />
                フォルダで見る
              </button>
            ) : null}
            {vm.kind === "setting" ? (
              <label className="mini-check">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(event) => emit({ type: "mark", path: [], done: event.target.checked })}
                />
                設定した
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
      {vm.notes.length > 0 ? (
        <ul className="transfer-notes">
          {vm.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TransferTab({ vm }: { vm: TransferTabVM }) {
  const emit = useEmit();
  return (
    <div className="tab-body transfer">
      <Section
        title="Zetter へ写す"
        description="Zetter のキャスト作成画面と同じ順に並べています。文章は「コピー」で写し、画像は「場所をコピー」してから Zetter のファイル選択の画面に貼り付けると選べます。コピーしたあとに書き換えた項目には「書き換えあり」が付きます。"
      />
      {/* 一覧のどこにいても使えるよう、タブの直下に置いて上に貼り付ける */}
      <div className="transfer-bar">
        <p className="transfer-progress" aria-live="polite">
          {vm.progress.text}
        </p>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!vm.next}
            onClick={() => emit({ type: "transfer/next" })}
            title={vm.shortcut}
          >
            {vm.next ? `次の項目をコピー（${vm.next.label}）` : "コピーする項目はありません"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => emit({ type: "transfer/open-zetter" })}
          >
            {vm.openLabel}
          </button>
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={() => emit({ type: "transfer/reset" })}
          >
            コピーの記録を消す
          </button>
        </div>
        <p className="note">
          このアプリの窓で {vm.shortcut}（Mac は ⌘⇧C）を押しても、次の項目をコピーできます。Zetter
          の欄に貼ったら、ここに戻って続けてください。
        </p>
      </div>
      {vm.groups.map((group) => (
        <Section key={group.title} title={group.title}>
          {group.sections.map((section, index) => (
            <div key={`${section.title}-${index}`} className="transfer-section">
              {section.title ? <h3 className="transfer-section-title">{section.title}</h3> : null}
              <ol className="transfer-list">
                {section.items.map((item) => (
                  <Link key={item.key} scope={item.path}>
                    <Item vm={item} />
                  </Link>
                ))}
              </ol>
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}
