import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";

import type { ChecksVM, EditorVM, PanelVM } from "../app/viewModels";
import { useEmit } from "./chain";
import { EmitButton, TabList, TabMeaning } from "./parts/basics";
import { IconCheck, IconError, IconInfo, IconRemove, IconWarning } from "./parts/icons";
import { AffinityTab } from "./tabs/AffinityTab";
import { CharacterTab } from "./tabs/CharacterTab";
import { ExperienceTab } from "./tabs/ExperienceTab";
import { LorebookTab, MemoTab, PublishTab } from "./tabs/OtherTabs";
import { TransferTab } from "./tabs/TransferTab";

const CHECKS_PANEL_ID = "checks-panel";

const LEVEL_ICONS = {
  error: <IconError />,
  warning: <IconWarning />,
  info: <IconInfo />,
};

function Panel({ vm }: { vm: PanelVM }) {
  switch (vm.tab) {
    case "character":
      return <CharacterTab vm={vm.vm} />;
    case "experience":
      return <ExperienceTab vm={vm.vm} />;
    case "affinity":
      return <AffinityTab vm={vm.vm} />;
    case "lorebook":
      return <LorebookTab vm={vm.vm} />;
    case "publish":
      return <PublishTab vm={vm.vm} />;
    case "memo":
      return <MemoTab vm={vm.vm} />;
    case "transfer":
      return <TransferTab vm={vm.vm} />;
  }
}

function Checks({
  vm,
  panelRef,
  closeRef,
}: {
  vm: ChecksVM;
  panelRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const emit = useEmit();
  return (
    <aside
      ref={panelRef}
      className="issues"
      id={CHECKS_PANEL_ID}
      aria-label="Zetter で完成するときの確認"
    >
      <div className="issues-head">
        <h2>Zetter で完成するときの確認</h2>
        <button
          ref={closeRef}
          type="button"
          className="icon-button issues-close"
          aria-label="確認を閉じる"
          title="閉じる"
          onClick={() => emit({ type: "editor/checks", open: false })}
        >
          <IconRemove />
        </button>
      </div>
      {vm.ok ? (
        <p className="issues-ok">
          <IconCheck />
          <span>
            見つかった問題はありません。この内容は Zetter の作成画面でそのまま完成できます。
          </span>
        </p>
      ) : (
        <p className="note">
          ローカルの保存は、このままでもできます。項目を押すと、直す場所へ移ります。
        </p>
      )}
      {vm.groups.map((group) => (
        <section key={group.level} className={`issue-group is-${group.level}`}>
          <h3>
            {group.title}
            <span className="issue-count">{group.issues.length}</span>
          </h3>
          <ul>
            {group.issues.map((issue) => (
              <li key={issue.key}>
                <EmitButton
                  event={{ type: "editor/jump", tab: issue.tab, target: issue.path }}
                  className="issue"
                >
                  <span className="issue-icon">{LEVEL_ICONS[issue.level]}</span>
                  <span className="issue-text">
                    <span className="issue-tab">{issue.tabLabel}</span>
                    <span>{issue.message}</span>
                  </span>
                </EmitButton>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

export function Editor({ vm }: { vm: EditorVM }) {
  const emit = useEmit();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (vm.checks.open) closeRef.current?.focus();
    else if (wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || panelRef.current?.contains(active))
        toggleRef.current?.focus();
    }
    wasOpen.current = vm.checks.open;
  }, [vm.checks.open]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && vm.checks.open) {
      event.stopPropagation();
      emit({ type: "editor/checks", open: false });
    }
  };
  return (
    <div className="editor" onKeyDown={onKeyDown}>
      <header className="editor-head">
        <div className="editor-title">
          <h1>{vm.title}</h1>
          <p className="editor-meta">
            {vm.meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </p>
        </div>
        <div className="editor-actions">
          <span className={`save-state ${vm.saveState.tone}`} role="status">
            {vm.saveState.text}
          </span>
          <button
            ref={toggleRef}
            type="button"
            className="btn btn-outline checks-toggle"
            aria-expanded={vm.checks.open}
            aria-controls={CHECKS_PANEL_ID}
            onClick={() => emit({ type: "editor/checks", open: !vm.checks.open })}
          >
            確認
            {vm.checks.blocking > 0 ? (
              <span className="tab-count is-error">{vm.checks.blocking}</span>
            ) : null}
          </button>
          {vm.deletion ? (
            <EmitButton
              event={{ type: "editor/delete" }}
              className="btn btn-plain btn-danger"
              disabled={vm.deletion.disabled}
              title="このキャストを、フォルダごとゴミ箱に移します"
            >
              削除
            </EmitButton>
          ) : null}
          {vm.canOpenFolder ? (
            <EmitButton event={{ type: "editor/open-folder" }} className="btn btn-plain">
              フォルダを開く
            </EmitButton>
          ) : null}
          <EmitButton
            event={{ type: "editor/save" }}
            className="btn btn-primary"
            disabled={vm.saving}
            title="Ctrl+S"
          >
            保存
          </EmitButton>
        </div>
      </header>
      {vm.notices.map((notice) => (
        <p key={notice} className="banner">
          {notice}
        </p>
      ))}
      <TabMeaning to={(id) => ({ type: "editor/tab", tab: id as EditorVM["tab"] })}>
        <TabList
          items={vm.tabs.map((tab) => ({ ...tab, domId: `editor-tab-${tab.id}` }))}
          label="設定の種類"
          className="tabs"
          controls="editor-panel"
          itemClass={(tab) => (tab.selected ? "tab is-selected" : "tab")}
        >
          {(tab) => (
            <>
              {tab.label}
              {tab.flag ? <span className="tab-flag">{tab.flag}</span> : null}
              {tab.count ? (
                <span className={`tab-count is-${tab.count.tone}`} aria-label={tab.count.label}>
                  {tab.count.value}
                </span>
              ) : null}
            </>
          )}
        </TabList>
      </TabMeaning>
      <div className={vm.checks.open ? "editor-body is-checks-open" : "editor-body"}>
        <div
          className="editor-main"
          id="editor-panel"
          role="tabpanel"
          aria-labelledby={`editor-tab-${vm.tab}`}
          key={`${vm.key}:${vm.tab}`}
        >
          <Panel vm={vm.panel} />
        </div>
        <div
          className="checks-scrim"
          aria-hidden="true"
          onClick={() => emit({ type: "editor/checks", open: false })}
        />
        <Checks vm={vm.checks} panelRef={panelRef} closeRef={closeRef} />
      </div>
    </div>
  );
}
