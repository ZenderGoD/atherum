import { Zap } from "lucide-react";

const links = {
  Product: [
    { name: "Docs", href: "#" },
    { name: "API Reference", href: "#" },
    { name: "Pricing", href: "#pricing" },
    { name: "Changelog", href: "#" },
  ],
  Resources: [
    { name: "GitHub", href: "#" },
    { name: "Status", href: "#" },
    { name: "Blog", href: "#" },
    { name: "Examples", href: "#" },
  ],
  Company: [
    { name: "About", href: "#" },
    { name: "Contact", href: "#" },
    { name: "Privacy", href: "#" },
    { name: "Terms", href: "#" },
  ],
};

export function Footer() {
  return (
    <footer className="relative border-t border-border/50 px-6 pt-16 pb-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <span className="text-lg font-bold tracking-tight">Atherum</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Collective intelligence engine for predictive simulation and
              deliberative evaluation.
            </p>
            <p className="mt-6 text-xs text-muted-foreground/60">
              Part of the Zeus ecosystem
            </p>
          </div>

          {/* Link groups */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <h4 className="text-sm font-semibold">{group}</h4>
              <ul className="mt-4 space-y-3">
                {items.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border/30 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground/60">
            {new Date().getFullYear()} Atherum. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground/40">
            <span>Powered by synthetic deliberation</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
