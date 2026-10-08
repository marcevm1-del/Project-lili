import { useEffect, useRef } from "react";
import { C } from "./ui.js";
import { screenListing } from "./listingRules.js";
import { useCompliance } from "./context.js";
import Icon from "../icons/Icon.jsx";

// Shown inline in the sell flow, live as the seller types. Three states with
// three different tones, because "you can't list this" and "this needs a look"
// are not the same message and a seller who is told they're a criminal for a
// price typo doesn't come back.
export default function ListingScreen({ title, description, brand, price,
                                        sellerType = "private", hasAuthentication,
                                        category = "", condition = "Excellent",
                                        subtitle = "", onVerdict }) {
  const { m } = useCompliance();
  const hasInput = (title || description || brand || price);

  // v2.8: category and condition now travel with the listing. Without them the
  // price band could not tell a silk scarf from a handbag, or a piece honestly
  // sold as Fair from one sold as Like New — and it was the seller who paid
  // for that, in counterfeit flags she had done nothing to earn.
  const result = hasInput ? screenListing({
    title, description, brand, price: Number(price) || 0,
    marketCode: m.code, sellerType, hasAuthentication, category, condition, subtitle,
  }) : null;

  // Reporting the verdict to the parent DURING render set state mid-render, so
  // the parent re-rendered, which re-screened, which reported again — React
  // error #185, "maximum update depth exceeded", and a crashed page. It has to
  // happen after the render commits.
  //
  // The dependency is the verdict SHAPE, not the result object: screenListing
  // returns a fresh object every time, so depending on it would loop just the
  // same way for a different reason.
  const signature = result
    ? `${result.verdict}|${(result.findings || []).map((f) => f.code || f.level || f).join(",")}`
    : "";
  const lastSent = useRef(null);

  useEffect(() => {
    if (!onVerdict || !result) return;
    if (lastSent.current === signature) return;   // nothing actually changed
    lastSent.current = signature;
    onVerdict(result);
  }, [signature, onVerdict, result]);

  if (!hasInput) return null;

  if (result.verdict === "ok") {
    return (
      <Box tone="ok">
        <b>Looks good.</b> Nothing here breaks the rules for {m.name}.
      </Box>
    );
  }

  const tone = result.verdict === "block" ? "block"
    : result.verdict === "review" ? "review" : "warn";

  const heading = {
    block:  "This can't be listed",
    review: "This will need a quick check",
    warn:   "Worth fixing before you publish",
  }[tone];

  const lead = {
    block:  `Not allowed on lili in ${m.name}.`,
    review: "You can publish — a reviewer looks at it before it goes live to buyers.",
    warn:   "You can publish as-is, but this is likely to cost you a sale.",
  }[tone];

  return (
    <Box tone={tone}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{heading}</div>
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>{lead}</div>
      {result.findings.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
          <span style={{ opacity: 0.6, fontSize: 11 }}>
            <Icon name={f.level === "block" ? "close" : f.level === "review" ? "clock" : "warning"}
                  size={12} stroke={2} style={{ marginTop: 2 }} />
          </span>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            {f.reason}
            {f.fix && <div style={{ opacity: 0.75, marginTop: 2 }}>{f.fix}</div>}
          </div>
        </div>
      ))}
    </Box>
  );
}

function Box({ tone, children }) {
  const palette = {
    ok:     { bg: "#F2F7F3", border: C.green, fg: C.ink },
    warn:   { bg: C.sand,    border: C.gold,  fg: C.ink },
    review: { bg: C.sand,    border: C.terra, fg: C.ink },
    block:  { bg: "#FBF0EE", border: C.red,   fg: C.ink },
  }[tone];
  return (
    <div style={{
      background: palette.bg, border: `1.5px solid ${palette.border}`,
      borderRadius: 12, padding: "12px 14px", color: palette.fg,
      fontSize: 12, lineHeight: 1.55, marginTop: 4,
    }}>{children}</div>
  );
}
