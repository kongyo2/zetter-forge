import {
  type CastDocument,
  type IntroPart,
  type RecommendedPersona,
  createEmptyPersona,
  sendableMembers,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { type CSSProperties, useRef } from "react";

import { IconPlus } from "../components/icons";
import { ImageField } from "../components/ImageField";
import {
  Counter,
  Disclosure,
  Field,
  MoveButtons,
  Section,
  TextArea,
  type TextHandle,
  TextInput,
  Toggle,
  moveItem,
} from "../components/ui";
import { useEditor } from "../editor";
import { castInk } from "../ink";

const USER_PLACEHOLDER = "{{user}}";

const MODE_OPTIONS = [
  {
    value: "story",
    title: "ストーリー",
    text: "地の文とセリフで、じっくり物語を進めます。",
  },
  {
    value: "chat",
    title: "雑談",
    text: "地の文なしで、短い掛け合いをテンポよく続けます。",
  },
] as const;

export function ExperienceTab() {
  const { doc, update } = useEditor();
  const story = doc.mode === "story";
  return (
    <div className="tab-body">
      <Section title="モード" description="このキャストの話し方の骨格です。">
        <div className="mode-options" role="radiogroup" aria-label="モード">
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={doc.mode === option.value ? "mode-option is-selected" : "mode-option"}
            >
              <input
                type="radio"
                name="cast-mode"
                value={option.value}
                checked={doc.mode === option.value}
                onChange={() => update((draft) => void (draft.mode = option.value))}
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

      {story ? (
        <>
          <Section
            title="体験の紹介"
            description="一覧カードと詳細ページで、物語の入口を伝えます。"
          >
            <Field
              label="キャッチコピー"
              required
              error={doc.tagline.trim() ? null : "キャッチコピーを入力してください"}
              counter={<Counter length={doc.tagline.length} max={LIMITS.tagline} />}
            >
              <TextInput
                value={doc.tagline}
                maxLength={LIMITS.tagline}
                placeholder="一言で紹介すると？"
                ariaLabel="キャッチコピー"
                invalid={!doc.tagline.trim()}
                onChange={(value) => update((draft) => void (draft.tagline = value))}
              />
            </Field>
          </Section>
          <Section title="物語の設定" description="舞台と会話の始まりを設定します。">
            <Field
              label="いまの状況"
              hint={
                <>
                  舞台となる場所・時間帯と、相手との関係。<code>{USER_PLACEHOLDER}</code>{" "}
                  は相手の呼び名に置き換わります。
                </>
              }
              counter={<Counter length={doc.situation.length} max={LIMITS.situation} />}
            >
              <TextArea
                value={doc.situation}
                maxLength={LIMITS.situation}
                placeholder="舞台設定・ユーザーとの関係性など"
                rows={5}
                ariaLabel="いまの状況"
                onChange={(value) => update((draft) => void (draft.situation = value))}
              />
            </Field>
          </Section>
          <StoryIntro />
        </>
      ) : (
        <ChatIntro />
      )}

      <Disclosure
        summary={
          <>
            オプション設定
            <span className="summary-hint">このキャストについて・この会話でのあなた</span>
          </>
        }
      >
        <AboutField />
        <Personas />
      </Disclosure>
    </div>
  );
}

function insertAtCursor(element: TextHandle | null, value: string, insertion: string) {
  const start = element?.selectionStart ?? value.length;
  const end = element?.selectionEnd ?? start;
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    caret: start + insertion.length,
  };
}

/** パートの種類と話者を 1 つの値にする（"narration" か "speech:<登場人物の id。本体は空>"）。 */
function roleValue(part: IntroPart): string {
  return part.kind === "narration" ? "narration" : `speech:${part.speakerId ?? ""}`;
}

function StoryIntro() {
  const { doc, update } = useEditor();
  const refs = useRef<(TextHandle | null)[]>([]);
  const members = sendableMembers(doc);
  const mainName = doc.name.trim() || "キャスト本体";
  const edit = (index: number, recipe: (part: IntroPart) => void) =>
    update((draft) => {
      const part = draft.introScript[index];
      if (part) recipe(part);
    });
  const setRole = (index: number, value: string) =>
    edit(index, (target) => {
      if (value === "narration") {
        target.kind = "narration";
        target.speakerId = null;
      } else {
        target.kind = "speech";
        target.speakerId = value.slice("speech:".length) || null;
      }
    });
  const inkOf = (part: IntroPart) => {
    if (!part.speakerId) return castInk(0);
    return castInk(doc.members.findIndex((member) => member.id === part.speakerId) + 1);
  };
  const count = doc.introScript.length;

  return (
    <Section
      title="イントロ"
      meta={`${count} / ${LIMITS.introParts}パート`}
      description="会話が始まったとき、相手に最初に見せる一幕です。情景のナレーション→第一声、が鉄板。"
    >
      {count === 0 ? (
        <p className="note empty">
          まだパートがありません。ナレーションで情景を置いてから、第一声のセリフを足してみてください。
        </p>
      ) : (
        <ol className="script">
          {doc.introScript.map((part, index) => {
            // 選べなくなった登場人物（中身を消した人）が話者のままなら、その人も選択肢に残す
            const orphan =
              part.speakerId && !members.some((member) => member.id === part.speakerId)
                ? doc.members.find((member) => member.id === part.speakerId)
                : undefined;
            const speech = part.kind === "speech";
            return (
              <li
                key={index}
                className={speech ? "script-line is-speech" : "script-line"}
                style={speech ? ({ "--ink": inkOf(part) } as CSSProperties) : undefined}
              >
                <div className="script-role">
                  <select
                    className="role-select"
                    aria-label={`パート${index + 1}の種類と話者`}
                    value={roleValue(part)}
                    onChange={(event) => setRole(index, event.target.value)}
                  >
                    <option value="narration">ナレーション</option>
                    {members.length > 0 || orphan ? (
                      <optgroup label="セリフ">
                        <option value="speech:">{mainName}</option>
                        {members.map((member) => (
                          <option key={member.id} value={`speech:${member.id}`}>
                            {member.name.trim() || "名前のない登場人物"}
                          </option>
                        ))}
                        {orphan ? (
                          <option value={`speech:${orphan.id}`}>
                            {orphan.name.trim() || "名前のない登場人物"}
                          </option>
                        ) : null}
                      </optgroup>
                    ) : (
                      <option value="speech:">セリフ</option>
                    )}
                  </select>
                  <MoveButtons
                    index={index}
                    count={count}
                    onMove={(from, to) => update((draft) => moveItem(draft.introScript, from, to))}
                    onRemove={() => update((draft) => void draft.introScript.splice(index, 1))}
                    removeLabel="このパートを削除"
                  />
                </div>
                <div className="script-text">
                  <TextArea
                    value={part.text}
                    maxLength={LIMITS.introPart}
                    placeholder={speech ? "セリフを入力" : "地の文を入力"}
                    rows={2}
                    ariaLabel={`イントロのパート${index + 1}`}
                    textareaRef={(element) => {
                      refs.current[index] = element;
                    }}
                    onChange={(value) => edit(index, (target) => void (target.text = value))}
                  />
                  <div className="field-foot">
                    <button
                      type="button"
                      className="btn btn-plain btn-small"
                      onClick={() => {
                        const element = refs.current[index] ?? null;
                        const next = insertAtCursor(element, part.text, USER_PLACEHOLDER);
                        edit(
                          index,
                          (target) => void (target.text = next.value.slice(0, LIMITS.introPart)),
                        );
                        requestAnimationFrame(() => {
                          element?.focus();
                          element?.setSelectionRange(next.caret, next.caret);
                        });
                      }}
                    >
                      {USER_PLACEHOLDER}を挿入
                    </button>
                    <Counter length={part.text.length} max={LIMITS.introPart} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-outline"
        disabled={count >= LIMITS.introParts}
        onClick={() =>
          update(
            (draft) =>
              void draft.introScript.push({ kind: "narration", text: "", speakerId: null }),
          )
        }
      >
        <IconPlus />
        パートを追加
      </button>
    </Section>
  );
}

function ChatIntro() {
  const { doc, update } = useEditor();
  const ref = useRef<TextHandle | null>(null);
  const first = doc.introScript[0];
  const text = first?.text ?? "";
  const hidden = Math.max(0, doc.introScript.length - 1);
  // 雑談モードの「最初のひとこと」は introScript の 1 件目（セリフ）。Zetter と同じく、なければ作る。
  const setText = (value: string) =>
    update((draft: CastDocument) => {
      const part = draft.introScript[0];
      if (part) part.text = value;
      else draft.introScript.push({ kind: "speech", text: value, speakerId: null });
    });
  return (
    <Section title="イントロ" description="会話が始まったとき、相手に最初に見せるひとことです。">
      <Field
        label="最初のひとこと"
        counter={<Counter length={text.length} max={LIMITS.introPart} />}
      >
        <TextArea
          value={text}
          maxLength={LIMITS.introPart}
          placeholder="キャストからの最初のメッセージ"
          rows={2}
          ariaLabel="最初のひとこと"
          textareaRef={(element) => (ref.current = element)}
          onChange={setText}
        />
      </Field>
      <div>
        <button
          type="button"
          className="btn btn-plain btn-small"
          onClick={() => {
            const next = insertAtCursor(ref.current, text, USER_PLACEHOLDER);
            setText(next.value.slice(0, LIMITS.introPart));
          }}
        >
          {USER_PLACEHOLDER}を挿入
        </button>
      </div>
      {hidden > 0 ? (
        <div className="inline-notice">
          <span>ほかに{hidden}件のセリフがあります（AIには送られます）</span>
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={() =>
              update((draft) => void (draft.introScript = draft.introScript.slice(0, 1)))
            }
          >
            まとめて削除
          </button>
        </div>
      ) : null}
    </Section>
  );
}

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

function AboutField() {
  const { doc, update } = useEditor();
  return (
    <div className="subsection">
      <Field
        label="このキャストについて"
        hint="AIには渡さない、表示専用の紹介文です。Markdownと装飾タグで詳細ページを自由に飾れます。"
        counter={<Counter length={doc.aboutText.length} max={LIMITS.aboutText} />}
      >
        <details className="format-guide">
          <summary>使える書式を見る</summary>
          <dl>
            {ABOUT_FORMAT_GUIDE.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </details>
        <TextArea
          value={doc.aboutText}
          maxLength={LIMITS.aboutText}
          placeholder={"例: [pink][large]ひよりです！[/large][/pink]\nよろしくね。"}
          rows={3}
          ariaLabel="このキャストについて"
          onChange={(value) => update((draft) => void (draft.aboutText = value))}
        />
      </Field>
    </div>
  );
}

function Personas() {
  const { doc, update } = useEditor();
  const personas = doc.recommendedPersonas;
  const edit = (index: number, recipe: (persona: RecommendedPersona) => void) =>
    update((draft) => {
      const persona = draft.recommendedPersonas[index];
      if (persona) recipe(persona);
    });
  return (
    <div className="subsection">
      <div className="subhead">
        <h3>この会話でのあなた</h3>
        <span className="counter">
          {personas.length} / {LIMITS.personas}件
        </span>
      </div>
      <p className="note">
        作者が用意する、推奨の役どころです。遊ぶ人はここから選んで会話を始められます。キャスト本体の文字数には含まれません。
      </p>
      {personas.length === 0 ? (
        <p className="note empty">
          まだありません。設定しなければ、遊ぶ人は自分のペルソナで始めます。
        </p>
      ) : (
        <ol className="rows">
          {personas.map((persona, index) => (
            <li key={persona.id} className="row persona-row">
              <div className="row-head">
                <span className="row-index">{index + 1}</span>
                <button
                  type="button"
                  className="btn btn-plain btn-small btn-danger"
                  onClick={() => update((draft) => void draft.recommendedPersonas.splice(index, 1))}
                >
                  このペルソナを削除
                </button>
              </div>
              <p className="layer-label">遊ぶ人に見えるもの</p>
              <div className="identity">
                <ImageField
                  kind="persona"
                  shape="circle"
                  emptyLabel="画像"
                  image={persona.avatar}
                  onChange={(image) => edit(index, (target) => void (target.avatar = image))}
                />
                <div className="identity-main">
                  <div className="field">
                    <TextInput
                      value={persona.useViewerName ? "" : persona.name}
                      maxLength={LIMITS.personaName}
                      disabled={persona.useViewerName}
                      placeholder={
                        persona.useViewerName ? "遊ぶ人の名前が入ります" : "名前（例: アキ）"
                      }
                      ariaLabel={`ペルソナ${index + 1}の名前`}
                      onChange={(value) => edit(index, (target) => void (target.name = value))}
                    />
                    <div className="field-foot">
                      <span />
                      <Counter
                        length={persona.useViewerName ? 0 : persona.name.length}
                        max={LIMITS.personaName}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <TextInput
                      value={persona.tagline}
                      maxLength={LIMITS.personaTagline}
                      placeholder="紹介文（例: 密かに片想いしている同級生）"
                      ariaLabel={`ペルソナ${index + 1}の紹介文`}
                      onChange={(value) => edit(index, (target) => void (target.tagline = value))}
                    />
                    <div className="field-foot">
                      <span />
                      <Counter length={persona.tagline.length} max={LIMITS.personaTagline} />
                    </div>
                  </div>
                  <Toggle
                    checked={persona.useViewerName}
                    onChange={(checked) =>
                      edit(index, (target) => void (target.useViewerName = checked))
                    }
                    title="遊ぶ人の名前を使う"
                  />
                </div>
              </div>
              <p className="layer-label">キャストに伝わるもの</p>
              <div className="field">
                <TextArea
                  value={persona.note}
                  maxLength={LIMITS.personaNote}
                  placeholder="例: 18歳。クールな印象でいつもジャージ姿"
                  rows={3}
                  ariaLabel={`ペルソナ${index + 1}のキャストに伝わるもの`}
                  onChange={(value) => edit(index, (target) => void (target.note = value))}
                />
                <div className="field-foot">
                  <span className="field-warning">
                    {!persona.name.trim() && !persona.useViewerName
                      ? "名前が空のペルソナは保存されません"
                      : ""}
                  </span>
                  <Counter length={persona.note.length} max={LIMITS.personaNote} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-outline"
        disabled={personas.length >= LIMITS.personas}
        onClick={() => update((draft) => void draft.recommendedPersonas.push(createEmptyPersona()))}
      >
        <IconPlus />
        ペルソナを追加
      </button>
    </div>
  );
}
