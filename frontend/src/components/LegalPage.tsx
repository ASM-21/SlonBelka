import termsRaw from "../legal/TERMS_OF_SERVICE.md?raw";
import privacyRaw from "../legal/PRIVACY_POLICY.md?raw";
import licensesRaw from "../legal/CONTENT_ATTRIBUTION.md?raw";

export type LegalDoc = "terms" | "privacy" | "licenses";

const DOCS: Record<LegalDoc, string> = {
  terms: termsRaw,
  privacy: privacyRaw,
  licenses: licensesRaw,
};

/**
 * Renders the bundled legal markdown (headings, bold, links, lists) with a
 * tiny in-repo renderer, so the docs stay plain markdown and need no
 * dependency. Reachable before login, so it must not assume an auth token.
 */
export default function LegalPage({ doc, onBack }: { doc: LegalDoc; onBack: () => void }) {
  return (
    <div className="mx-auto mt-8 w-full max-w-md px-5 pb-16 text-sm text-sb-ink">
      <button onClick={onBack} className="mb-4 text-sm text-sb-muted hover:text-sb-ink">
        ← назад · back
      </button>
      {renderMarkdown(DOCS[doc])}
    </div>
  );
}

function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] != null) {
      parts.push(<strong key={`${keyBase}b${i++}`}>{m[1]}</strong>);
    } else if (/^https?:/i.test(m[3])) {
      parts.push(
        <a
          key={`${keyBase}a${i++}`}
          href={m[3]}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {m[2]}
        </a>,
      );
    } else {
      // Relative cross-links between the docs render as plain text.
      parts.push(<span key={`${keyBase}s${i++}`}>{m[2]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMarkdown(raw: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    const k = key++;
    out.push(
      <ul key={k} className="mb-3 list-disc space-y-1 pl-5">
        {list.map((li, i) => (
          <li key={i}>{inline(li, `${k}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    const k = key++;
    out.push(
      <p key={k} className="mb-3 leading-relaxed">
        {inline(para.join(" "), String(k))}
      </p>,
    );
    para = [];
  };

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("<!--")) continue;
    if (t === "") {
      flushList();
      flushPara();
      continue;
    }
    if (t.startsWith("### ")) {
      flushList();
      flushPara();
      out.push(<h3 key={key} className="mb-2 mt-5 font-semibold">{inline(t.slice(4), String(key++))}</h3>);
      continue;
    }
    if (t.startsWith("## ")) {
      flushList();
      flushPara();
      out.push(<h2 key={key} className="mb-2 mt-6 text-lg font-semibold">{inline(t.slice(3), String(key++))}</h2>);
      continue;
    }
    if (t.startsWith("# ")) {
      flushList();
      flushPara();
      out.push(<h1 key={key} className="mb-3 text-2xl font-semibold">{inline(t.slice(2), String(key++))}</h1>);
      continue;
    }
    if (t.startsWith("- ")) {
      flushPara();
      list.push(t.slice(2));
      continue;
    }
    const numbered = t.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushPara();
      list.push(numbered[1]);
      continue;
    }
    para.push(t);
  }
  flushList();
  flushPara();
  return out;
}
