import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { EditorSettings } from "@shared/editorSettings";
import CodeMirror, { type BasicSetupOptions, ExternalChange } from "@uiw/react-codemirror";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type { TextHandle } from "../components/ui";
import { markdownSupport } from "./markdown";
import { MermaidPreview } from "./MermaidPreview";
import { pomlSupport } from "./poml/poml";
import { forgeDarkTheme, forgeLightTheme } from "./theme";

// 文章を書く欄なので、行番号・折りたたみ・今の行の色付けは出さない
const BASIC_SETUP: BasicSetupOptions = {
  lineNumbers: false,
  foldGutter: false,
  foldKeymap: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
};

/** .textarea と同じ行の高さ（15px × 1.9）と上下の余白 */
const LINE_PX = 28.5;
const PADDING_PX = 20;
const MAX_HEIGHT = "480px";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function subscribeDark(onChange: () => void): () => void {
  const query = darkQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** <textarea> と同じ使い方ができるように、選択範囲とフォーカスだけを見せる */
function textHandle(view: EditorView): TextHandle {
  return {
    get selectionStart() {
      return view.state.selection.main.from;
    },
    get selectionEnd() {
      return view.state.selection.main.to;
    },
    focus: () => view.focus(),
    setSelectionRange: (start, end) => {
      const length = view.state.doc.length;
      view.dispatch({
        selection: { anchor: Math.min(start, length), head: Math.min(end, length) },
        scrollIntoView: true,
      });
    },
  };
}

export function CodeTextArea({
  value,
  onChange,
  maxLength,
  placeholder,
  rows,
  invalid,
  ariaLabel,
  textareaRef,
  settings,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  rows: number;
  invalid?: boolean;
  ariaLabel?: string;
  textareaRef?: (element: TextHandle | null) => void;
  settings: EditorSettings;
}) {
  const dark = useSyncExternalStore(subscribeDark, () => darkQuery().matches);
  // @uiw/react-codemirror は onChange や extensions が変わるたびに設定をやり直すので、変わらないものを渡す
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleChange = useCallback((next: string) => onChangeRef.current(next), []);
  const textareaRefRef = useRef(textareaRef);
  textareaRefRef.current = textareaRef;
  const viewRef = useRef<EditorView | null>(null);
  useEffect(
    () => () => {
      viewRef.current = null;
      textareaRefRef.current?.(null);
    },
    [],
  );

  // 画面側で value を変えたとき（「{{user}}を挿入」など）は、その場で欄にも入れる。
  // @uiw/react-codemirror も入れ直すが、描画のあと（useEffect）なので、続けてカーソルを動かす処理に間に合わない。
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: ExternalChange.of(true),
    });
  }, [value]);

  const { syntax, pomlAssist, mermaidAssist, mermaidPreview } = settings;
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
      }),
      // <textarea maxlength> と同じく、上限を超える入力は受け付けない（もともと超えている文章を削るのと、
      // 画面側から value を入れ直すのはよい）
      maxLength === undefined
        ? []
        : EditorState.changeFilter.of(
            (transaction) =>
              transaction.newDoc.length <= maxLength ||
              transaction.newDoc.length <= transaction.startState.doc.length ||
              transaction.annotation(ExternalChange) === true,
          ),
      syntax === "poml"
        ? pomlSupport({ assist: pomlAssist })
        : markdownSupport({ mermaid: mermaidAssist }),
    ],
    [ariaLabel, invalid, maxLength, syntax, pomlAssist, mermaidAssist],
  );

  return (
    <div className={invalid ? "code-textarea is-invalid" : "code-textarea"}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        basicSetup={BASIC_SETUP}
        indentWithTab={false}
        placeholder={placeholder}
        theme={dark ? forgeDarkTheme : forgeLightTheme}
        minHeight={`${Math.round(rows * LINE_PX + PADDING_PX)}px`}
        maxHeight={MAX_HEIGHT}
        onCreateEditor={(view) => {
          viewRef.current = view;
          textareaRefRef.current?.(textHandle(view));
        }}
      />
      {syntax === "markdown" && mermaidPreview ? <MermaidPreview source={value} /> : null}
    </div>
  );
}
