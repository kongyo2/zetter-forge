// 画面の部品が、いろいろな中身の値（View Model）で描けるか（描くだけで、ブラウザは使わない）。
import {
  AFFINITY_BASE_SUBJECT,
  createDefaultAffinityConfig,
  createEmptyMember,
  createEmptyPersona,
} from "@shared/cast";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ViewTab } from "../src/renderer/src/app/types";
import { Root } from "../src/renderer/src/views/Root";
import { castNamed, opened, started } from "./helpers/world";

const TABS: ViewTab[] = [
  "character",
  "experience",
  "affinity",
  "lorebook",
  "publish",
  "memo",
  "transfer",
];

function richCast() {
  const aoi = {
    ...createEmptyMember(),
    name: "葵",
    profile: "妹。",
    avatar: { file: "images/member-02-a.jpg", width: 400, height: 400, bytes: 2048 },
  };
  const nameless = { ...createEmptyMember(), toneExamples: [{ situation: "朝", example: "" }] };
  const config = createDefaultAffinityConfig();
  return castNamed("灯里", {
    tagline: "雨の日だけ開く古書店",
    situation: "{{user}} が店に来た。",
    members: [aoi, nameless],
    toneExamples: [{ situation: "雨の日", example: "……いらっしゃい" }],
    introScript: [
      { kind: "narration", text: "雨。", speakerId: null },
      { kind: "speech", text: "いらっしゃい。", speakerId: aoi.id },
      { kind: "speech", text: "", speakerId: null },
    ],
    recommendedPersonas: [
      { ...createEmptyPersona(), name: "アキ", tagline: "同級生" },
      { ...createEmptyPersona(), useViewerName: true },
    ],
    affinity: {
      default: config,
      overrides: {
        [AFFINITY_BASE_SUBJECT]: { ...createDefaultAffinityConfig(), enabled: false },
        [aoi.id]: { ...createDefaultAffinityConfig(), itemName: "" },
      },
    },
    lorebooks: [{ id: "book", title: "古書店の町", note: "メモ" }],
    tags: ["古書店", ""],
    gallery: [
      {
        file: "images/gallery-01-a.jpg",
        width: 10,
        height: 20,
        bytes: 100,
        id: "g1",
        blurred: true,
      },
    ],
    cover: { file: "images/cover-a.jpg", width: 900, height: 1200, bytes: 4096 },
    hook: "……で、話って何？",
    zetterUrl: "https://z-etter.com/cast/1",
  });
}

describe("画面の部品", () => {
  it("最初の画面と一覧を描ける", async () => {
    const world = await started([{ name: "灯里", tagline: "雨の日だけ開く" }]);
    const html = renderToString(<Root mediator={world.mediator} />);
    expect(html).toContain("キャストを、手元で育てる。");
    expect(html).toContain("雨の日だけ開く");
  });

  it("どのタブも、いろいろな中身で描ける（ストーリー・雑談）", async () => {
    const world = await started([{ name: "灯里" }]);
    await opened(world, "cast-0", richCast());
    for (const mode of ["story", "chat"] as const) {
      world.dispatch({ type: "input", path: ["cast", "mode"], value: mode });
      for (const tab of TABS) {
        world.dispatch({ type: "editor/tab", tab });
        const html = renderToString(<Root mediator={world.mediator} />);
        expect(html).toContain('role="tabpanel"');
      }
    }
  });

  it("登場人物・好感度の個別設定・開いた段階・確かめのダイアログ・知らせも描ける", async () => {
    const world = await started([{ name: "灯里" }]);
    await opened(world, "cast-0", richCast());
    const aoi = world.session().doc.members[0]?.id as string;
    world.dispatch({ type: "editor/character", id: aoi });
    expect(renderToString(<Root mediator={world.mediator} />)).toContain("葵を削除");
    world.dispatch({ type: "editor/tab", tab: "affinity" });
    for (const key of ["default", AFFINITY_BASE_SUBJECT, aoi]) {
      world.dispatch({ type: "editor/subject", key });
      world.dispatch({ type: "editor/stage", index: 1 });
      expect(renderToString(<Root mediator={world.mediator} />)).toContain("好感度の設定対象");
    }
    world.dispatch({ type: "remove", path: ["tags", 0] });
    world.dispatch({ type: "remove", path: ["members", aoi] });
    const html = renderToString(<Root mediator={world.mediator} />);
    expect(html).toContain("<dialog");
    expect(html).toContain("元に戻す");
  });

  it("切り抜きのダイアログを描ける", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({
      type: "pick",
      path: ["gallery"],
      files: [
        { name: "a.png", type: "image/png", size: 1 },
        { name: "b.png", type: "image/png", size: 1 },
      ],
    });
    expect(renderToString(<Root mediator={world.mediator} />)).toContain("読み込み中…");
    world.take("read").resolve("data:image/png;base64,AAAA");
    await world.flush();
    const html = renderToString(<Root mediator={world.mediator} />);
    expect(html).toContain("1 / 2枚目");
    expect(html).toContain("この範囲にする");
  });
});
