import { useLayoutEffect, useRef } from "react";

import type { TransferItemVM, TransferTabVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import { CopyButton, EmitButton, MiniCheck, Section, ShowFileButton } from "../parts/basics";
import { IconCheck, IconWarning } from "../parts/icons";

function Item({ vm }: { vm: TransferItemVM }) {
  const emit = useEmit();
  const ref = useRef<HTMLLIElement | null>(null);
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
            {vm.canShowFile ? <ShowFileButton /> : null}
            {vm.kind === "setting" ? (
              <MiniCheck
                checked={done}
                onChange={(checked) => emit({ type: "mark", path: [], done: checked })}
              >
                設定した
              </MiniCheck>
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
  return (
    <div className="tab-body transfer">
      <Section
        title="Zetter へ写す"
        description="Zetter のキャスト作成画面と同じ順に並べています。文章は「コピー」で写し、画像は「場所をコピー」してから Zetter のファイル選択の画面に貼り付けると選べます。コピーしたあとに書き換えた項目には「書き換えあり」が付きます。"
      />
      <div className="transfer-bar">
        <p className="transfer-progress" aria-live="polite">
          {vm.progress.text}
        </p>
        <div className="button-row">
          <EmitButton
            event={{ type: "transfer/next" }}
            className="btn btn-primary"
            disabled={!vm.next}
            title={vm.shortcut}
          >
            {vm.next ? `次の項目をコピー（${vm.next.label}）` : "コピーする項目はありません"}
          </EmitButton>
          <EmitButton event={{ type: "transfer/open-zetter" }} className="btn btn-outline">
            {vm.openLabel}
          </EmitButton>
          <EmitButton event={{ type: "transfer/reset" }} className="btn btn-plain btn-small">
            コピーの記録を消す
          </EmitButton>
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
