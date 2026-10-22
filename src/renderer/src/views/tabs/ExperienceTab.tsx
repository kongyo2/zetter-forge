import type { CSSProperties } from "react";

import type { ExperienceTabVM, IntroPartVM, PersonaVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import { Disclosure, MoveButtons, Section, Select, Toggle } from "../parts/basics";
import { IconPlus } from "../parts/icons";
import { ImageField } from "../parts/ImageField";
import { TextField } from "../parts/TextField";

const ABOUT_FORMAT_GUIDE = [
  ["Markdown", "**太字** ・ *斜体* ・ ~~取消線~~ ・ # 見出し ・ > 引用 ・ - 箇条書き"],
  [
    "装飾タグ",
    "[pink]文字[/pink]（色） ・ [bg-yellow]文字[/bg-yellow]（背景ハイライト） ・ [large]文字[/large]（サイズ）",
  ],
  [
    "フォント",
    "[font-round] 丸文字 ・ [font-serif] 明朝 ・ [font-mono] 等幅 ・ [font-gothic] ゴシック ・ [font-pop] 手書き風 ・ [font-kyokasho] 教科書体（例: [font-pop]文字[/font-pop]）",
  ],
  [
    "カラーコードで自由指定",
    "[color=#ff69b4]文字[/color]（文字色） ・ [bg=#ffe6a7]文字[/bg]（背景） ・ [border=#00b894]文字[/border]（枠線）※#RGBまたは#RRGGBBのみ",
  ],
  [
    "文字揃え",
    "[center]〜[/center]（中央） ・ [right]〜[/right]（右） ・ [left]〜[/left]（左、1行でも複数行でもOK）",
  ],
  ["段落全体を色付き箱にする", "[box-yellow]〜[/box-yellow]（1行でも複数行でもOK）"],
  ["欄全体を色付きにする", "先頭行に [page-bg-yellow] とだけ書く"],
] as const;

function Mode({ vm }: { vm: ExperienceTabVM["mode"] }) {
  const emit = useEmit();
  return (
    <Section title="モード" description="このキャストの話し方の骨格です。">
      <div className="mode-options" role="radiogroup" aria-label="モード">
        {vm.options.map((option) => (
          <label
            key={option.value}
            className={option.selected ? "mode-option is-selected" : "mode-option"}
          >
            <input
              type="radio"
              className="visually-hidden"
              name="cast-mode"
              value={option.value}
              checked={option.selected}
              onChange={() => emit({ type: "input", path: vm.name, value: option.value })}
            />
            <span className="mode-dot" aria-hidden="true" />
            <span className="mode-text">
              <strong>{option.title}</strong>
              <span>{option.text}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="note">
        後から変更できます。すでに始まっている会話には影響しません。雑談モードでも、キャッチコピー・いまの状況・一言セリフ・登場人物の内容は消えずに残ります。
      </p>
    </Section>
  );
}

function IntroLine({ vm }: { vm: IntroPartVM }) {
  return (
    <li
      className={vm.speech ? "script-line is-speech" : "script-line"}
      style={vm.ink ? ({ "--ink": vm.ink } as CSSProperties) : undefined}
    >
      <div className="script-role">
        <Select vm={vm.role} className="role-select" />
        <MoveButtons vm={vm.move} />
      </div>
      <div className="script-text">
        <TextField vm={vm.text} />
      </div>
    </li>
  );
}

function StoryIntro({ vm }: { vm: NonNullable<ExperienceTabVM["story"]>["intro"] }) {
  const emit = useEmit();
  return (
    <Section
      title="イントロ"
      meta={vm.meta}
      description="会話が始まったとき、相手に最初に見せる一幕です。情景のナレーション→第一声、が鉄板。"
    >
      {vm.parts.length === 0 ? (
        <p className="note empty">
          まだパートがありません。ナレーションで情景を置いてから、第一声のセリフを足してみてください。
        </p>
      ) : (
        <ol className="script">
          {vm.parts.map((part) => (
            <Link key={part.index} scope={[part.index]}>
              <IntroLine vm={part} />
            </Link>
          ))}
        </ol>
      )}
      <div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!vm.canAdd}
          onClick={() => emit({ type: "add", path: [] })}
        >
          <IconPlus />
          パートを追加
        </button>
      </div>
    </Section>
  );
}

function ChatIntro({ vm }: { vm: NonNullable<ExperienceTabVM["chat"]> }) {
  const emit = useEmit();
  return (
    <Section title="イントロ" description="会話が始まったとき、相手に最初に見せるひとことです。">
      <TextField vm={vm.first} />
      {vm.hidden ? (
        <div className="inline-notice">
          <span>{vm.hidden}</span>
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={() => emit({ type: "remove", path: ["rest"] })}
          >
            まとめて削除
          </button>
        </div>
      ) : null}
    </Section>
  );
}

function Persona({ vm }: { vm: PersonaVM }) {
  const emit = useEmit();
  return (
    <li className="row persona-row">
      <div className="row-head">
        <span className="row-index">{vm.index + 1}</span>
        <button
          type="button"
          className="btn btn-plain btn-small btn-danger"
          onClick={() => emit({ type: "remove", path: [] })}
        >
          このペルソナを削除
        </button>
      </div>
      <p className="layer-label">遊ぶ人に見えるもの</p>
      <div className="identity">
        <ImageField vm={vm.avatar} />
        <div className="identity-main">
          <TextField vm={vm.name} />
          <TextField vm={vm.tagline} />
          <Toggle vm={vm.useViewerName} />
        </div>
      </div>
      <p className="layer-label">キャストに伝わるもの</p>
      <TextField vm={vm.note} />
    </li>
  );
}

function Personas({ vm }: { vm: ExperienceTabVM["personas"] }) {
  const emit = useEmit();
  return (
    <div className="subsection">
      <div className="subhead">
        <h3>この会話でのあなた</h3>
        <span className="counter">{vm.meta}</span>
      </div>
      <p className="note">
        作者が用意する、推奨の役どころです。遊ぶ人はここから選んで会話を始められます。キャスト本体の文字数には含まれません。
      </p>
      {vm.rows.length === 0 ? (
        <p className="note empty">
          まだありません。設定しなければ、遊ぶ人は自分のペルソナで始めます。
        </p>
      ) : (
        <ol className="rows">
          {vm.rows.map((row) => (
            <Link key={row.id} scope={[row.id]}>
              <Persona vm={row} />
            </Link>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-outline"
        disabled={!vm.canAdd}
        onClick={() => emit({ type: "add", path: [] })}
      >
        <IconPlus />
        ペルソナを追加
      </button>
    </div>
  );
}

export function ExperienceTab({ vm }: { vm: ExperienceTabVM }) {
  return (
    <div className="tab-body">
      <Link scope={vm.scope}>
        <Mode vm={vm.mode} />
        {vm.story ? (
          <>
            <Section
              title="体験の紹介"
              description="一覧カードと詳細ページで、物語の入口を伝えます。"
            >
              <TextField vm={vm.story.tagline} />
            </Section>
            <Section title="物語の設定" description="舞台と会話の始まりを設定します。">
              <TextField vm={vm.story.situation} />
            </Section>
          </>
        ) : null}
      </Link>
      {vm.story ? (
        <Link scope={vm.story.intro.scope}>
          <StoryIntro vm={vm.story.intro} />
        </Link>
      ) : null}
      {vm.chat ? (
        <Link scope={vm.chat.scope}>
          <ChatIntro vm={vm.chat} />
        </Link>
      ) : null}
      <Disclosure summary="オプション設定" hint="このキャストについて・この会話でのあなた">
        <div className="subsection">
          <details className="format-guide">
            <summary>このキャストについてで使える書式を見る</summary>
            <dl>
              {ABOUT_FORMAT_GUIDE.map(([term, text]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Link scope={vm.scope}>
            <TextField vm={vm.about} />
          </Link>
        </div>
        <Link scope={vm.personas.scope}>
          <Personas vm={vm.personas} />
        </Link>
      </Disclosure>
    </div>
  );
}
