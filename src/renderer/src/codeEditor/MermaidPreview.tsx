import { useEffect, useId, useState } from "react";

import { mermaidBlocksOf } from "./mermaid";
import { loadMermaid } from "./mermaidLoader";

type Rendered = { svg: string } | { error: string };

const RENDER_DELAY_MS = 500;

/** 入力欄の中の ```mermaid の図を、mermaid で描いて並べる */
export function MermaidPreview({ source }: { source: string }) {
  const [diagrams, setDiagrams] = useState<Rendered[]>([]);
  // mermaid は id を CSS セレクタに使うので、React の id の「:」を外す
  const prefix = `mermaid-${useId().replace(/[^\w-]/gu, "")}`;

  useEffect(() => {
    const blocks = mermaidBlocksOf(source).filter((block) => block.code.trim());
    if (blocks.length === 0) {
      setDiagrams([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const mermaid = await loadMermaid();
        // mermaid は描く順番を自分で並べるので、まとめて頼んでよい
        const rendered = await Promise.all(
          blocks.map(async (block, index): Promise<Rendered> => {
            try {
              const { svg } = await mermaid.render(`${prefix}-${index}`, block.code);
              return { svg };
            } catch (error) {
              return { error: error instanceof Error ? error.message : String(error) };
            }
          }),
        );
        if (!cancelled) setDiagrams(rendered);
      })();
    }, RENDER_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, prefix]);

  if (diagrams.length === 0) return null;
  return (
    <div className="mermaid-preview" role="group" aria-label="Mermaid の図">
      {diagrams.map((diagram, index) =>
        "svg" in diagram ? (
          // mermaid が securityLevel: "strict" で消毒した SVG
          <div
            key={index}
            className="mermaid-diagram"
            dangerouslySetInnerHTML={{ __html: diagram.svg }}
          />
        ) : (
          <p key={index} className="mermaid-error">
            {diagram.error.split("\n").slice(0, 4).join("\n")}
          </p>
        ),
      )}
    </div>
  );
}
