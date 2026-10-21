import { type CastMember, createEmptyMember, removeMember, sendableMembers } from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { formatCount } from "@shared/text";
import { settingsUsage, toneUsage } from "@shared/validate";
import { type ReactNode, useState } from "react";

import { PartnerSettingsEditor, ToneExamplesEditor } from "../components/CharacterParts";
import { ImageField } from "../components/ImageField";
import {
  Budget,
  Card,
  Counter,
  Disclosure,
  Field,
  SectionHead,
  TextArea,
  TextInput,
  Toggle,
} from "../components/ui";
import { useEditor } from "../editor";

export function CharacterTab() {
  const { doc, update } = useEditor();
  const story = doc.mode === "story";
  const [selected, setSelected] = useState<string>("main");
  const settings = settingsUsage(doc);
  const tone = toneUsage(doc);
  const member = story ? doc.members.find((candidate) => candidate.id === selected) : undefined;
  const memberIndex = member ? doc.members.indexOf(member) : -1;
  const characterCount = 1 + (story ? doc.members.length : 0);
  const settingsCounter = (length: number) => (
    <span
      className={
        settings.over > 0 || settings.remaining <= LIMITS.settingsTotal * 0.1
          ? "counter is-near"
          : "counter"
      }
    >
      {formatCount(length)}字 ・ 全体の残り {formatCount(settings.remaining)}字
    </span>
  );
  const settingsNote =
    settings.over > 0
      ? `${formatCount(settings.over)}字ぶん超えています。誰の設定を削るかはお任せします。`
      : `${story ? "本人と登場人物ぜんぶの設定" : "本人の設定"}の合計です（「いまの状況」は別枠20,000字）。あと${formatCount(settings.remaining)}字ぶん、好きな人に配れます。`;
  const toneNote =
    tone.over > 0
      ? `${formatCount(tone.over)}字ぶん超えています。誰の口調サンプルを削るかはお任せします。`
      : `${story ? "本体と登場人物ぜんぶ" : "本体"}の口調サンプルの合計です。あと${formatCount(tone.remaining)}字ぶん使えます。`;

  const addMember = () => {
    const created = createEmptyMember();
    update((draft) => {
      draft.members.push(created);
    });
    setSelected(created.id);
  };

  return (
    <div className="tab-body">
      {story ? (
        <SectionHead
          title="登場人物"
          description="この物語に出てくる人たちです。1人目がこのキャスト本人で、最大10人まで足せます。性格・設定は本人と登場人物全員で合わせて20,000字（配分は自由です）。「いまの状況」は別枠で20,000字です。"
        />
      ) : (
        <SectionHead title="キャラクター" description="このキャラクターを編集します。" />
      )}
      <div className="budgets">
        <Budget
          label="キャラクター設定の合計"
          total={settings.total}
          max={LIMITS.settingsTotal}
          note={settingsNote}
        />
        <Budget
          label="口調サンプルの使用量（全員合計）"
          total={tone.total}
          max={LIMITS.toneTotal}
          note={toneNote}
        />
      </div>
      {story ? (
        <>
          <p className="note">おすすめは登場人物2人まで（本体とあわせて3人での会話）。</p>
          <div className="character-chooser" role="tablist" aria-label="編集するキャラクター">
            <span className="counter">
              {characterCount} / {LIMITS.charactersTotal}
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={!member}
              className={!member ? "chooser-item is-selected" : "chooser-item"}
              onClick={() => setSelected("main")}
            >
              <span>{doc.name.trim() || "本人"}</span>
              <small>{!member ? "編集中" : "1人目"}</small>
            </button>
            {doc.members.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={member?.id === item.id}
                className={member?.id === item.id ? "chooser-item is-selected" : "chooser-item"}
                onClick={() => setSelected(item.id)}
              >
                <span>{item.name.trim() || `${index + 2}人目`}</span>
                <small>{member?.id === item.id ? "編集中" : `${index + 2}人目`}</small>
              </button>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-small"
              disabled={characterCount >= LIMITS.charactersTotal}
              onClick={addMember}
            >
              キャラクター追加 {characterCount}/{LIMITS.charactersTotal}
            </button>
          </div>
        </>
      ) : null}

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
        <Card>
          <div className="card-head">
            <span className="card-kicker">1人目</span>
            <span className="note">このキャスト本人</span>
          </div>
          <div className="identity">
            <div>
              <ImageField
                kind="avatar"
                shape="circle"
                emptyLabel="アイコン"
                image={doc.avatar}
                blurred={doc.avatarBlurred}
                onChange={(image) => update((draft) => void (draft.avatar = image))}
              />
            </div>
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
          <Disclosure summary="オプション設定">
            <PartnerSettingsEditor
              value={doc.partnerSettings}
              onChange={(value) => update((draft) => void (draft.partnerSettings = value))}
            />
            <ToneExamplesEditor
              items={doc.toneExamples}
              onChange={(value) => update((draft) => void (draft.toneExamples = value))}
            />
          </Disclosure>
        </Card>
      )}
      <p className="note">入力した設定はキャストの会話に使われます。画像は任意です。</p>
      {!story && doc.members.length > 0 ? (
        <p className="note">
          ストーリーモードで書いた登場人物が{doc.members.length}
          人ぶん残っています。雑談モードでは送られません（ストーリーに戻すと使えます）。
        </p>
      ) : null}
    </div>
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
  const edit = (recipe: (target: CastMember) => void) =>
    update((draft) => {
      const target = draft.members.find((candidate) => candidate.id === member.id);
      if (target) recipe(target);
    });
  return (
    <Card>
      <div className="card-head">
        <span className="card-kicker">{index + 2}人目</span>
        <button
          type="button"
          className="btn btn-plain btn-small btn-danger"
          onClick={() => {
            if (window.confirm(`${member.name.trim() || `${index + 2}人目`}を削除しますか？`))
              onRemove();
          }}
        >
          {index + 2}人目を削除
        </button>
      </div>
      <div className="identity">
        <div>
          <ImageField
            kind="member"
            shape="circle"
            emptyLabel="アイコン"
            image={member.avatar}
            onChange={(image) => edit((target) => void (target.avatar = image))}
          />
        </div>
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
      <Disclosure summary="オプション設定">
        <PartnerSettingsEditor
          value={member.partnerSettings}
          onChange={(value) => edit((target) => void (target.partnerSettings = value))}
        />
        <ToneExamplesEditor
          items={member.toneExamples}
          onChange={(value) => edit((target) => void (target.toneExamples = value))}
        />
      </Disclosure>
    </Card>
  );
}
