import { type CastMember, createEmptyMember, removeMember, sendableMembers } from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { formatCount } from "@shared/text";
import { settingsShares, settingsUsage, toneShares, type UsageShare } from "@shared/validate";
import { type CSSProperties, type ReactNode, useState } from "react";

import { Allowance, type AllowancePart, CHARS_PER_CELL } from "../components/Allowance";
import { PartnerSettingsEditor, ToneExamplesEditor } from "../components/CharacterParts";
import { IconPlus } from "../components/icons";
import { ImageField } from "../components/ImageField";
import {
  Avatar,
  Counter,
  Disclosure,
  Field,
  onTabListKeyDown,
  Section,
  TextArea,
  TextInput,
  Toggle,
} from "../components/ui";
import { useEditor } from "../editor";
import { castInk, INKED_CHARACTERS } from "../ink";

export function CharacterTab() {
  const { doc, update, src } = useEditor();
  const story = doc.mode === "story";
  const [selected, setSelected] = useState<string>("main");
  const settings = settingsUsage(doc);
  const member = story ? doc.members.find((candidate) => candidate.id === selected) : undefined;
  const memberIndex = member ? doc.members.indexOf(member) : -1;
  const characterCount = 1 + (story ? doc.members.length : 0);

  const nameOf = (memberId: string | null) => {
    if (memberId === null) return doc.name.trim() || "本人";
    const index = doc.members.findIndex((candidate) => candidate.id === memberId);
    return doc.members[index]?.name.trim() || `${index + 2}人目`;
  };
  // 9 人目からは色が足りないので「ほか N人」にまとめる
  const toParts = (shares: UsageShare[]): AllowancePart[] => {
    const parts = shares.slice(0, INKED_CHARACTERS).map((share, index) => ({
      key: share.memberId ?? "main",
      label: nameOf(share.memberId),
      length: share.length,
      ink: castInk(index),
    }));
    const rest = shares.slice(INKED_CHARACTERS);
    if (rest.length > 0) {
      parts.push({
        key: "rest",
        label: `ほか${rest.length}人`,
        length: rest.reduce((sum, share) => sum + share.length, 0),
        ink: castInk(INKED_CHARACTERS),
      });
    }
    return parts;
  };
  const settingsParts = toParts(settingsShares(doc));
  const toneParts = toParts(toneShares(doc));
  const settingsOver =
    settingsParts.reduce((sum, part) => sum + part.length, 0) > LIMITS.settingsTotal;
  const toneOver = toneParts.reduce((sum, part) => sum + part.length, 0) > LIMITS.toneTotal;

  const settingsCounter = (length: number) => (
    <span
      className={
        settings.over > 0
          ? "counter is-over"
          : settings.remaining <= LIMITS.settingsTotal * 0.1
            ? "counter is-near"
            : "counter"
      }
    >
      {formatCount(length)}字
      {story ? (
        <span className="counter-aside">全体の残り{formatCount(settings.remaining)}字</span>
      ) : null}
    </span>
  );

  const addMember = () => {
    const created = createEmptyMember();
    update((draft) => {
      draft.members.push(created);
    });
    setSelected(created.id);
  };

  const allowances = (
    <div className="allowances">
      <Allowance
        title="性格・設定"
        parts={settingsParts}
        max={LIMITS.settingsTotal}
        note={
          settingsOver
            ? "誰の設定を削るかはお任せします。"
            : story
              ? "本人と登場人物の合計です。配分は自由です（「いまの状況」は別枠で20,000字）。"
              : null
        }
      />
      <Allowance
        title="口調サンプル"
        parts={toneParts}
        max={LIMITS.toneTotal}
        note={
          toneOver ? "誰の口調サンプルを削るかはお任せします。" : "状況と発話例の字数の合計です。"
        }
      />
      <p className="note allowance-scale">
        マス目はひとつ{CHARS_PER_CELL}字（原稿用紙1枚ぶん）です。
      </p>
    </div>
  );

  const sheetInk = castInk(member ? memberIndex + 1 : 0);
  const panelLabel = member ? `cast-tab-${member.id}` : "cast-tab-main";

  return (
    <div className="tab-body">
      {story ? (
        <Section
          title="登場人物"
          meta={`${characterCount} / ${LIMITS.charactersTotal}人`}
          description="この物語に出てくる人たちです。1人目がこのキャスト本人で、最大10人まで足せます。おすすめは登場人物2人まで（本体とあわせて3人での会話）です。"
        >
          {allowances}
        </Section>
      ) : (
        <Section>{allowances}</Section>
      )}

      <div className="cast-desk">
        {story ? (
          <div className="cast-bar">
            <div
              className="cast-tabs"
              role="tablist"
              aria-label="編集するキャラクター"
              onKeyDown={onTabListKeyDown}
            >
              <button
                type="button"
                role="tab"
                id="cast-tab-main"
                aria-selected={!member}
                tabIndex={!member ? 0 : -1}
                className={!member ? "cast-tab is-selected" : "cast-tab"}
                onClick={() => setSelected("main")}
              >
                <Avatar
                  src={src(doc.avatar)}
                  name={doc.name}
                  ink={castInk(0)}
                  blurred={doc.avatarBlurred}
                  size="small"
                />
                <span className="cast-tab-text">
                  <span className="cast-tab-name">{doc.name.trim() || "名前未設定"}</span>
                  <small>本人</small>
                </span>
              </button>
              {doc.members.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`cast-tab-${item.id}`}
                  aria-selected={member?.id === item.id}
                  tabIndex={member?.id === item.id ? 0 : -1}
                  className={member?.id === item.id ? "cast-tab is-selected" : "cast-tab"}
                  onClick={() => setSelected(item.id)}
                >
                  <Avatar
                    src={src(item.avatar)}
                    name={item.name}
                    ink={castInk(index + 1)}
                    size="small"
                  />
                  <span className="cast-tab-text">
                    <span className="cast-tab-name">{item.name.trim() || "名前未設定"}</span>
                    <small>{index + 2}人目</small>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-plain btn-small"
              disabled={characterCount >= LIMITS.charactersTotal}
              onClick={addMember}
            >
              <IconPlus />
              登場人物を追加
            </button>
          </div>
        ) : null}

        <div
          className="cast-sheet"
          style={{ "--ink": sheetInk } as CSSProperties}
          {...(story ? { role: "tabpanel", "aria-labelledby": panelLabel } : {})}
        >
          {member ? (
            <MemberPanel
              member={member}
              index={memberIndex}
              settingsCounter={settingsCounter}
              onRemove={() => {
                update((draft) => removeMember(draft, member.id));
                setSelected("main");
              }}
            />
          ) : (
            <>
              <div className="identity">
                <ImageField
                  kind="avatar"
                  shape="circle"
                  emptyLabel="アイコン"
                  image={doc.avatar}
                  blurred={doc.avatarBlurred}
                  onChange={(image) => update((draft) => void (draft.avatar = image))}
                />
                <div className="identity-main">
                  <Field
                    label="名前"
                    required
                    error={doc.name.trim() ? null : "名前を入力してください"}
                    counter={<Counter length={doc.name.length} max={LIMITS.name} />}
                  >
                    <TextInput
                      value={doc.name}
                      maxLength={LIMITS.name}
                      placeholder="キャストの名前"
                      ariaLabel="名前"
                      invalid={!doc.name.trim()}
                      onChange={(value) => update((draft) => void (draft.name = value))}
                    />
                  </Field>
                  <Toggle
                    checked={doc.avatarBlurred}
                    onChange={(checked) => update((draft) => void (draft.avatarBlurred = checked))}
                    title="この画像をぼかして表示する"
                  />
                </div>
              </div>
              <Field
                label="性格・設定"
                required
                hint="形容詞より、行動の癖で書くと生きます。「優しい」より「お礼が言えず『……置いといて』と言いながら必ず飲む」。"
                error={doc.persona.trim() ? null : "性格・設定を入力してください"}
                counter={settingsCounter(doc.persona.length)}
              >
                <TextArea
                  value={doc.persona}
                  maxLength={LIMITS.settingsTotal}
                  placeholder="性格・話し方・背景など"
                  rows={8}
                  ariaLabel="性格・設定"
                  invalid={!doc.persona.trim()}
                  onChange={(value) => update((draft) => void (draft.persona = value))}
                />
              </Field>
              <Disclosure summary={<OptionSummary />}>
                <PartnerSettingsEditor
                  value={doc.partnerSettings}
                  onChange={(value) => update((draft) => void (draft.partnerSettings = value))}
                />
                <ToneExamplesEditor
                  items={doc.toneExamples}
                  onChange={(value) => update((draft) => void (draft.toneExamples = value))}
                />
              </Disclosure>
            </>
          )}
        </div>
      </div>

      <p className="note">入力した設定はキャストの会話に使われます。画像は任意です。</p>
      {!story && doc.members.length > 0 ? (
        <p className="inline-notice">
          ストーリーモードで書いた登場人物が{doc.members.length}
          人ぶん残っています。雑談モードでは送られません（ストーリーに戻すと使えます）。
        </p>
      ) : null}
    </div>
  );
}

function OptionSummary() {
  return (
    <>
      オプション設定
      <span className="summary-hint">パートナー設定・口調サンプル</span>
    </>
  );
}

function MemberPanel({
  member,
  index,
  settingsCounter,
  onRemove,
}: {
  member: CastMember;
  index: number;
  settingsCounter: (length: number) => ReactNode;
  onRemove: () => void;
}) {
  const { doc, update } = useEditor();
  const sendable = sendableMembers(doc).includes(member);
  const label = member.name.trim() || `${index + 2}人目`;
  const edit = (recipe: (target: CastMember) => void) =>
    update((draft) => {
      const target = draft.members.find((candidate) => candidate.id === member.id);
      if (target) recipe(target);
    });
  return (
    <>
      <div className="cast-sheet-actions">
        <button
          type="button"
          className="btn btn-plain btn-small btn-danger"
          onClick={() => {
            if (window.confirm(`${label}を削除しますか？`)) onRemove();
          }}
        >
          {label}を削除
        </button>
      </div>
      <div className="identity">
        <ImageField
          kind="member"
          shape="circle"
          emptyLabel="アイコン"
          image={member.avatar}
          onChange={(image) => edit((target) => void (target.avatar = image))}
        />
        <div className="identity-main">
          <Field
            label="名前"
            required
            error={sendable && !member.name.trim() ? "名前を入力してください" : null}
            counter={<Counter length={member.name.length} max={LIMITS.memberName} />}
          >
            <TextInput
              value={member.name}
              maxLength={LIMITS.memberName}
              placeholder="この人の名前"
              ariaLabel={`${index + 2}人目の名前`}
              invalid={sendable && !member.name.trim()}
              onChange={(value) => edit((target) => void (target.name = value))}
            />
          </Field>
        </div>
      </div>
      <Field
        label="性格・設定"
        hint="性格・話し方・ほかの登場人物との関係。AIに渡ります。"
        counter={settingsCounter(member.profile.length)}
      >
        <TextArea
          value={member.profile}
          maxLength={LIMITS.settingsTotal}
          placeholder="性格・話し方・ほかの人との関係"
          rows={5}
          ariaLabel={`${index + 2}人目の性格・設定`}
          onChange={(value) => edit((target) => void (target.profile = value))}
        />
      </Field>
      <Disclosure summary={<OptionSummary />}>
        <PartnerSettingsEditor
          value={member.partnerSettings}
          onChange={(value) => edit((target) => void (target.partnerSettings = value))}
        />
        <ToneExamplesEditor
          items={member.toneExamples}
          onChange={(value) => edit((target) => void (target.toneExamples = value))}
        />
      </Disclosure>
    </>
  );
}
