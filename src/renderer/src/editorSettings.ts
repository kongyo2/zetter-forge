import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@shared/editorSettings";
import { createContext, useContext } from "react";

/** 入力欄の書式の設定（App が読み込んで配る） */
export const EditorSettingsContext = createContext<EditorSettings>(DEFAULT_EDITOR_SETTINGS);

export function useEditorSettings(): EditorSettings {
  return useContext(EditorSettingsContext);
}
