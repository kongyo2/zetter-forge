import { newId } from "@shared/cast";
import { LIMITS } from "@shared/limits";

import { IconPlus } from "../components/icons";
import { Counter, MoveButtons, Section, TextArea, TextInput, moveItem } from "../components/ui";
import { useEditor } from "../editor";

export function LorebookTab() {
  const { doc, update } = useEditor();
  return (
    <div className="tab-body">
      <Section
        title="設定集を連動"
        meta={`${doc.lorebooks.length} / ${LIMITS.lorebooks}冊`}
        description="会話でキーワードに反応する設定集を選びます。設定集そのものは Zetter 側で作ってキャストに連動させるので、ここには連動させる設定集の名前とメモを残します（1つのキャストに10冊まで）。"
      >
        {doc.lorebooks.length === 0 ? (
          <p className="note empty">連動させる設定集はまだありません。</p>
        ) : (
          <ol className="rows">
            {doc.lorebooks.map((book, index) => (
              <li key={book.id} className="row">
                <div className="row-head">
                  <span className="row-index">{index + 1}</span>
                  <MoveButtons
                    index={index}
                    count={doc.lorebooks.length}
                    onMove={(from, to) => update((draft) => moveItem(draft.lorebooks, from, to))}
                    onRemove={() => update((draft) => void draft.lorebooks.splice(index, 1))}
                    removeLabel="この設定集を外す"
                  />
                </div>
                <label className="field">
                  <span className="field-label">書名</span>
                  <TextInput
                    value={book.title}
                    maxLength={LIMITS.lorebookTitle}
                    placeholder="Zetter での設定集の書名"
                    ariaLabel={`設定集${index + 1}の書名`}
                    onChange={(value) =>
                      update((draft) => {
                        const target = draft.lorebooks[index];
                        if (target) target.title = value;
                      })
                    }
                  />
                  <span className="field-foot">
                    <span />
                    <Counter length={book.title.length} max={LIMITS.lorebookTitle} />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">メモ</span>
                  <TextArea
                    value={book.note}
                    rows={2}
                    placeholder="作者、URL、使う理由など（Zetter には送られません）"
                    ariaLabel={`設定集${index + 1}のメモ`}
                    onChange={(value) =>
                      update((draft) => {
                        const target = draft.lorebooks[index];
                        if (target) target.note = value;
                      })
                    }
                  />
                </label>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          className="btn btn-outline"
          disabled={doc.lorebooks.length >= LIMITS.lorebooks}
          onClick={() =>
            update((draft) => void draft.lorebooks.push({ id: newId(), title: "", note: "" }))
          }
        >
          <IconPlus />
          設定集を追加
        </button>
      </Section>
    </div>
  );
}
