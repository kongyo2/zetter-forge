import type { AffinityConfigVM, AffinityTabVM, RulerVM, StageVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import {
  AddButton,
  CastTabs,
  Counter,
  EmitButton,
  RemoveButton,
  Section,
  Select,
  TabMeaning,
  Toggle,
} from "../parts/basics";
import { IconError } from "../parts/icons";
import { TextField } from "../parts/TextField";

function ResetToCommon() {
  return (
    <EmitButton event={{ type: "remove", path: [] }} className="btn btn-plain">
      共通設定に戻す
    </EmitButton>
  );
}

function Ruler({ vm }: { vm: RulerVM }) {
  const emit = useEmit();
  return (
    <figure className="ruler">
      <div className="ruler-track">
        {vm.bands.map((band) => (
          <button
            key={band.index}
            type="button"
            className={band.open ? "ruler-band is-open" : "ruler-band"}
            style={{ left: band.left, width: band.width }}
            aria-label={`${band.label}を開く`}
            title={band.label}
            onClick={() => emit({ type: "editor/stage", index: band.index })}
          />
        ))}
      </div>
      <div className="ruler-scale" aria-hidden="true">
        {vm.bands.map((band) => (
          <span key={band.index} style={{ left: band.left }}>
            {band.from}
          </span>
        ))}
        <span className="is-end" style={{ left: "100%" }}>
          {vm.max}
        </span>
      </div>
      {vm.initial ? (
        <div className="ruler-initial" style={{ left: vm.initial.left }}>
          初期値 {vm.initial.value}
        </div>
      ) : null}
      <figcaption className="visually-hidden">{vm.caption}</figcaption>
    </figure>
  );
}

function Stage({ vm }: { vm: StageVM }) {
  const emit = useEmit();
  return (
    <li className={vm.open ? "stage is-open" : "stage"}>
      <button
        type="button"
        className="stage-toggle"
        aria-expanded={vm.open}
        onClick={() => emit({ type: "editor/stage", index: vm.open ? -1 : vm.index })}
      >
        <span className="stage-name">{vm.name}</span>
        <span className="stage-range">{vm.range}</span>
        <span className="stage-summary">{vm.summary}</span>
        <span className="stage-filled">{vm.filled}</span>
      </button>
      {vm.open ? (
        <Link scope={["stages", vm.index]}>
          <StageBody vm={vm} />
        </Link>
      ) : null}
    </li>
  );
}

function StageBody({ vm }: { vm: StageVM }) {
  return (
    <div className="stage-body">
      <div className="stage-start">
        <TextField vm={vm.start} />
        {vm.startNote ? <span className="note">{vm.startNote}</span> : null}
        {vm.duplicate ? (
          <span className="field-error">開始値が他の段階と重複しています。</span>
        ) : null}
      </div>
      {vm.fields.map((field) => (
        <TextField key={field.name.join("/")} vm={field} />
      ))}
      <div className="field-foot">
        {vm.canRemove ? <RemoveButton>この段階を削除</RemoveButton> : <span />}
        <Counter vm={vm.counter} />
      </div>
    </div>
  );
}

function Config({ vm }: { vm: AffinityConfigVM }) {
  return (
    <>
      <div className="affinity-grid">
        <TextField vm={vm.itemName} />
        <div className="affinity-range">
          {vm.ranges.map((range) => (
            <TextField key={range.name.join("/")} vm={range} />
          ))}
          <label className="field">
            <span className="field-label">{vm.pace.label}</span>
            <Select vm={vm.pace} />
          </label>
        </div>
        <Toggle vm={vm.showInChat} />
        {vm.disabled ? <Toggle vm={vm.disabled} /> : null}
      </div>
      {vm.error ? (
        <p className="field-error block">
          <IconError />
          {vm.error}
        </p>
      ) : null}
      {vm.ruler ? <Ruler vm={vm.ruler} /> : null}
      <ol className="stages">
        {vm.stages.map((stage) => (
          <Stage key={stage.index} vm={stage} />
        ))}
      </ol>
      <div className="button-row">
        <AddButton path={["stages"]} disabled={!vm.canAddStage}>
          段階を追加
          <span className="btn-count">{vm.stageCount}</span>
        </AddButton>
        {vm.canReset ? <ResetToCommon /> : null}
      </div>
    </>
  );
}

export function AffinityTab({ vm }: { vm: AffinityTabVM }) {
  return (
    <div className="tab-body">
      <Link scope={vm.scope}>
        <Affinity vm={vm} />
      </Link>
    </div>
  );
}

function Affinity({ vm }: { vm: AffinityTabVM }) {
  const description =
    "会話の積み重ねに合わせて、キャラクターごとの態度を変えます。共通設定は、個別設定のないキャラ全員に使われます。本体や登場人物ごとに個別設定を作ったり、好感度を使わない設定にもできます。";
  const notice = vm.notice ? <p className="inline-notice">{vm.notice}</p> : null;
  return (
    <>
      {!vm.setup ? (
        <Section
          title="好感度"
          description="会話の積み重ねに合わせて、キャラクターごとの態度を変えます。"
        >
          {notice}
          <p className="note empty">
            まだ設定されていません。設定を始めると4段階のひな形が入ります。
          </p>
          <div>
            <EmitButton event={{ type: "add", path: [] }} className="btn btn-primary">
              好感度を設定する
            </EmitButton>
          </div>
        </Section>
      ) : (
        <>
          <Section title="好感度" description={description}>
            {notice}
          </Section>
          <div className="cast-desk">
            <TabMeaning to={(key) => ({ type: "editor/subject", key })}>
              <CastTabs
                items={vm.setup.subjects}
                label="好感度の設定対象"
                controls="affinity-panel"
              />
            </TabMeaning>
            <div className="cast-sheet" role="tabpanel" id="affinity-panel">
              <Link scope={vm.setup.subject}>
                <Subject sheet={vm.setup.sheet} />
              </Link>
            </div>
          </div>
          <div>
            <RemoveButton>好感度設定を削除</RemoveButton>
          </div>
        </>
      )}
    </>
  );
}

function Subject({ sheet }: { sheet: NonNullable<AffinityTabVM["setup"]>["sheet"] }) {
  if (sheet.kind === "config") return <Config vm={sheet.config} />;
  if (sheet.kind === "disabled") {
    return (
      <>
        <Toggle vm={sheet.disabled} />
        <p className="note">このキャラには好感度を使いません。</p>
        {sheet.error ? (
          <p className="field-error block">
            <IconError />
            {sheet.error}（上の切り替えをオフにすると、直す欄が出ます）
          </p>
        ) : null}
        <div>
          <ResetToCommon />
        </div>
      </>
    );
  }
  return (
    <>
      <p className="note">
        共通設定を使っています。このキャラだけ変えたいときは、個別設定を作ってください。
      </p>
      <div className="button-row">
        <EmitButton event={{ type: "add", path: [] }} className="btn btn-outline">
          個別設定を作る
        </EmitButton>
        <EmitButton
          event={{ type: "check", path: ["disabled"], checked: true }}
          className="btn btn-plain"
        >
          このキャラは好感度を使わない
        </EmitButton>
      </div>
    </>
  );
}
