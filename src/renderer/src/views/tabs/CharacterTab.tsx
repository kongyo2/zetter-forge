import type { CSSProperties } from "react";

import type { CharacterSheetVM, CharacterTabVM, PartnerVM, ToneListVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import { Allowance } from "../parts/Allowance";
import {
  AddButton,
  CastTabs,
  Counter,
  Disclosure,
  RemoveButton,
  Section,
  SortableRow,
  TabMeaning,
  Toggle,
} from "../parts/basics";
import { IconPlus } from "../parts/icons";
import { ImageField } from "../parts/ImageField";
import { TextField } from "../parts/TextField";

function Partner({ vm }: { vm: PartnerVM }) {
  return (
    <div className="subsection">
      <div className="subhead">
        <h3>パートナー設定</h3>
        <Counter vm={vm.counter} />
      </div>
      <p className="note">
        パートナー（DM
        のようなやり取り）での、このキャラクターのふるまいです。5つの欄の合計で5,000字まで書けます。
      </p>
      {vm.fields.map((field) => (
        <TextField key={field.name.join("/")} vm={field} />
      ))}
    </div>
  );
}

function Tones({ vm }: { vm: ToneListVM }) {
  return (
    <div className="subsection">
      <div className="subhead">
        <h3>口調サンプル</h3>
        <span className="counter">{vm.meta}</span>
      </div>
      <p className="note">口調例は基本の話し方の見本です。好感度の段階の話し方が優先されます。</p>
      {vm.rows.length === 0 ? (
        <p className="note empty">まだありません。3〜5件あると声が安定します。</p>
      ) : (
        <ol className="rows">
          {vm.rows.map((row) => (
            <Link key={row.index} scope={[row.index]}>
              <SortableRow index={row.index} move={row.move} className="tone-row">
                <TextField vm={row.situation} />
                <TextField vm={row.example} />
              </SortableRow>
            </Link>
          ))}
        </ol>
      )}
      <AddButton disabled={!vm.canAdd}>口調サンプルを追加</AddButton>
    </div>
  );
}

function Sheet({ vm }: { vm: CharacterSheetVM }) {
  return (
    <>
      {vm.removeLabel ? (
        <div className="cast-sheet-actions">
          <RemoveButton>{vm.removeLabel}</RemoveButton>
        </div>
      ) : null}
      <div className="identity">
        <ImageField vm={vm.avatar} />
        <div className="identity-main">
          <TextField vm={vm.name} />
          {vm.avatarBlurred ? <Toggle vm={vm.avatarBlurred} /> : null}
        </div>
      </div>
      <TextField vm={vm.profile} />
      <Disclosure summary="オプション設定" hint="パートナー設定・口調サンプル">
        <Link scope={vm.partner.scope}>
          <Partner vm={vm.partner} />
        </Link>
        <Link scope={vm.tones.scope}>
          <Tones vm={vm.tones} />
        </Link>
      </Disclosure>
    </>
  );
}

export function CharacterTab({ vm }: { vm: CharacterTabVM }) {
  const emit = useEmit();
  const allowances = (
    <div className="allowances">
      {vm.allowances.map((allowance) => (
        <Allowance key={allowance.title} vm={allowance} />
      ))}
      <p className="note allowance-scale">{vm.scale}</p>
    </div>
  );
  return (
    <div className="tab-body">
      {vm.story ? (
        <Section
          title="登場人物"
          meta={vm.people}
          description="この物語に出てくる人たちです。1人目がこのキャスト本人で、最大10人まで足せます。おすすめは登場人物2人まで（本体とあわせて3人での会話）です。"
        >
          {allowances}
        </Section>
      ) : (
        <Section>{allowances}</Section>
      )}

      <div className="cast-desk">
        {vm.castTabs ? (
          <div className="cast-bar">
            <TabMeaning to={(id) => ({ type: "editor/character", id })}>
              <CastTabs items={vm.castTabs.items} label="編集するキャラクター" />
            </TabMeaning>
            <button
              type="button"
              className="btn btn-plain btn-small"
              disabled={!vm.castTabs.canAdd}
              onClick={() => emit({ type: "add", path: ["members"] })}
            >
              <IconPlus />
              登場人物を追加
            </button>
          </div>
        ) : null}

        <div
          className="cast-sheet"
          style={{ "--ink": vm.sheet.ink } as CSSProperties}
          {...(vm.labelledBy ? { role: "tabpanel", "aria-labelledby": vm.labelledBy } : {})}
        >
          {/* 本人と登場人物で欄の並びは同じなので、切り替えても開いた「オプション設定」はそのまま */}
          <Link scope={vm.sheet.scope}>
            <Sheet vm={vm.sheet} />
          </Link>
        </div>
      </div>

      <p className="note">入力した設定はキャストの会話に使われます。画像は任意です。</p>
      {vm.leftover ? <p className="inline-notice">{vm.leftover}</p> : null}
    </div>
  );
}
