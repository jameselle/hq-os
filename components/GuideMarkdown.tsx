// A guide rendered from markdown, with pipe tables drawn as real tables (lib/markdown-blocks.ts).
import { Fragment } from "react";
import ReactMarkdown from "react-markdown";

import { splitBlocks } from "@/lib/markdown-blocks";

const Inline = ({ text }: { text: string }) => (
  <ReactMarkdown components={{ p: ({ children }) => <Fragment>{children}</Fragment> }}>{text}</ReactMarkdown>
);

export function GuideMarkdown({ markdown }: { markdown: string }) {
  return (
    <>
      {splitBlocks(markdown).map((b, i) =>
        b.kind === "text" ? (
          <ReactMarkdown key={i}>{b.text}</ReactMarkdown>
        ) : (
          <div key={i} className="overflow-x-auto my-3">
            <table className="guide-table">
              <thead>
                <tr>{b.head.map((h, j) => <th key={j}><Inline text={h} /></th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </>
  );
}
