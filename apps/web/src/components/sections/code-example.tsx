"use client";

import { FadeIn } from "@/components/motion-wrapper";
import { Copy } from "lucide-react";
import { useState } from "react";

const requestCode = `curl -X POST https://api.atherum.dev/v1/review \\
  -H "Authorization: Bearer ak_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "content_description": "Summer campaign hero image featuring diverse group enjoying outdoor festival",
    "image_url": "https://cdn.example.com/campaigns/summer-24/hero.jpg",
    "agents": 10,
    "rounds": 3
  }'`;

const responseCode = `{
  "id": "rev_8x2kLm9nPq",
  "status": "complete",
  "verdict": "approved_with_suggestions",
  "approval_score": 0.87,
  "convergence_score": 0.96,
  "rounds_completed": 3,
  "duration_ms": 16240,
  "agreements": [
    "Strong visual diversity and inclusive representation",
    "Authentic outdoor setting aligns with campaign theme",
    "Color palette evokes warmth and energy"
  ],
  "dissent": [
    {
      "agent": "accessibility_reviewer",
      "concern": "Text overlay contrast ratio may be insufficient",
      "severity": "medium"
    }
  ],
  "suggestions": [
    "Increase text contrast ratio to meet WCAG AA",
    "Consider adding motion-safe animation for digital placements"
  ]
}`;

function CodeBlock({
  title,
  code,
  language,
}: {
  title: string;
  code: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {title}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.7]">
        <code>
          {language === "bash" ? <BashHighlight code={code} /> : <JsonHighlight code={code} />}
        </code>
      </pre>
    </div>
  );
}

function BashHighlight({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <div key={i}>
          {line.split(/("[^"]*")/g).map((part, j) => {
            if (part.startsWith('"') && part.endsWith('"')) {
              return (
                <span key={j} className="token-string">
                  {part}
                </span>
              );
            }
            return part.split(/(-[A-Z]\s)/g).map((segment, k) => {
              if (/^-[A-Z]\s$/.test(segment)) {
                return (
                  <span key={k} className="token-flag">
                    {segment}
                  </span>
                );
              }
              if (segment.includes("https://")) {
                return segment.split(/(https:\/\/[^\s"\\]+)/g).map((s, l) => {
                  if (s.startsWith("https://")) {
                    return (
                      <span key={l} className="token-url">
                        {s}
                      </span>
                    );
                  }
                  return (
                    <span key={l} className="text-foreground/80">
                      {s}
                    </span>
                  );
                });
              }
              if (segment === "curl") {
                return (
                  <span key={k} className="token-keyword">
                    {segment}
                  </span>
                );
              }
              return (
                <span key={k} className="text-foreground/80">
                  {segment}
                </span>
              );
            });
          })}
          {"\n"}
        </div>
      ))}
    </>
  );
}

function JsonHighlight({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <div key={i}>
          {line.split(/("[^"]*"\s*:?\s*)/g).map((part, j) => {
            if (part.match(/^"[^"]*"\s*:\s*$/)) {
              return (
                <span key={j} className="token-property">
                  {part}
                </span>
              );
            }
            if (part.match(/^"[^"]*"$/)) {
              return (
                <span key={j} className="token-string">
                  {part}
                </span>
              );
            }
            return part.split(/(\b(?:true|false|null|\d+(?:\.\d+)?)\b)/g).map((seg, k) => {
              if (/^(true|false|null|\d+(?:\.\d+)?)$/.test(seg)) {
                return (
                  <span key={k} className="token-value">
                    {seg}
                  </span>
                );
              }
              return (
                <span key={k} className="token-punctuation">
                  {seg}
                </span>
              );
            });
          })}
          {"\n"}
        </div>
      ))}
    </>
  );
}

export function CodeExample() {
  return (
    <section id="api" className="relative px-6 py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              API
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              One call. Ten perspectives.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Integrate collective intelligence into your pipeline with a single
              REST endpoint. Get structured, multi-agent feedback in under 20
              seconds.
            </p>
          </div>
        </FadeIn>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <FadeIn delay={0.1} direction="left">
            <CodeBlock title="Request" code={requestCode} language="bash" />
          </FadeIn>
          <FadeIn delay={0.2} direction="right">
            <CodeBlock title="Response" code={responseCode} language="json" />
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
