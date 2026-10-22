// Zetter のキャスト作成画面と同じ上限（2026-10-23 時点の z-etter.com/cast/create、app.js?v=04fa86f0e7a9 で確認）。
// 文字数の数え方は 2 通りある。HTML の maxlength と同じ UTF-16 単位で数える欄と、
// 好感度・パートナー設定のように Array.from で数える（コードポイント単位）欄。
export const LIMITS = {
  name: 10,
  memberName: 10,
  tagline: 40,
  hook: 40,
  situation: 20000,
  aboutText: 3000,
  introPart: 4000,
  introParts: 12,
  tag: 20,
  tags: 5,
  toneSituation: 250,
  toneExample: 3500,
  toneItemsPerCharacter: 10,
  /** 本人の性格・設定＋登場人物全員のプロフィールの合計（UTF-16 単位） */
  settingsTotal: 20000,
  /** 本人＋登場人物全員の口調サンプル（状況＋発話例）の合計（UTF-16 単位） */
  toneTotal: 10000,
  /** 登場人物（本人を含む） */
  charactersTotal: 10,
  members: 9,
  personas: 5,
  personaName: 20,
  personaTagline: 50,
  personaNote: 2000,
  /** パートナー設定 5 欄の合計（コードポイント単位） */
  partnerSettingsTotal: 5000,
  affinityItemName: 20,
  affinityStages: 10,
  /** 好感度の 1 段階の 6 欄の合計（コードポイント単位） */
  affinityStageText: 1000,
  gallery: 10,
  lorebooks: 10,
  lorebookTitle: 20,
} as const;
