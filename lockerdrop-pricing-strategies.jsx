import { useState } from "react";

const strategies = [
  {
    id: 1,
    name: "Pure Per-Order Fee",
    tagline: "$1–$2 per locker transaction",
    howItWorks:
      "Merchants pay nothing to install. Every time a customer checks out with locker pickup, Shopify's usage-based billing charges the merchant a flat fee. You pay Harbor out of that fee.",
    billingMechanism:
      "Shopify Billing API → appSubscriptionCreate with usage line item. You call usageRecordCreate after each order webhook. Capped amount set per 30-day cycle (e.g. $200).",
    revenueExample: {
      orders: 200,
      rate: "$1.50/order",
      gross: "$300/mo",
      harborCost: "~$100/mo",
      net: "~$200/mo",
    },
    pros: [
      "Zero friction to install — merchants love free apps",
      "Revenue scales directly with merchant success",
      "Easy to understand and communicate",
      "Lowest barrier for early adoption",
      "Already partially built ($1/order in your code)",
    ],
    cons: [
      "Revenue is $0 from inactive merchants",
      "Hard to predict monthly income",
      "Low-volume merchants may not cover your Harbor costs",
      "Merchants with high volume may feel it's expensive",
    ],
    bestFor: "Launch. Gets merchants in the door fast. Proves product-market fit before optimizing.",
    complexity: 1,
    predictability: 1,
    growthPotential: 3,
    launchSpeed: 5,
    color: "#10b981",
    icon: "⚡",
  },
  {
    id: 2,
    name: "Tiered Subscription",
    tagline: "$0/mo · $19/mo · $49/mo",
    howItWorks:
      "Free tier with limited orders (e.g. 10/mo), paid tiers unlock more orders, lockers, and features like custom branding or priority support. Overage charged per-order.",
    billingMechanism:
      "Shopify Managed Pricing (recommended) — set up plans in Partner Dashboard, Shopify hosts the plan selection page. Or Billing API with appSubscriptionCreate for recurring line item.",
    revenueExample: {
      orders: "Mixed",
      rate: "Free / $19 / $49",
      gross: "$49 × 20 paid merchants = $980/mo",
      harborCost: "~$300/mo",
      net: "~$680/mo",
    },
    pros: [
      "Predictable recurring revenue",
      "Free tier drives adoption, paid tiers capture value",
      "Shopify Managed Pricing handles plan selection UI for you",
      "Can gate premium features (analytics, branding, multi-locker)",
      "Industry standard — merchants expect this model",
    ],
    cons: [
      "Need enough features to justify tier differences",
      "Free tier merchants cost you money if they use Harbor",
      "More complex billing logic to build and maintain",
      "Risk of churn if merchants don't see enough value at paid tiers",
    ],
    bestFor: "Post-launch growth. Once you have 10+ merchants and know which features they value most.",
    complexity: 3,
    predictability: 4,
    growthPotential: 4,
    launchSpeed: 2,
    color: "#6366f1",
    icon: "📊",
  },
  {
    id: 3,
    name: "Subscription + Usage Hybrid",
    tagline: "$9/mo base + $0.75/order",
    howItWorks:
      "Small monthly base fee covers platform access. Per-order usage fee on top covers Harbor costs and your margin. Base fee ensures you earn something even from low-volume merchants.",
    billingMechanism:
      "Shopify Billing API → appSubscriptionCreate with TWO line items: one recurring ($9/mo) + one usage-based ($0.75/order with capped amount). This is a supported combo.",
    revenueExample: {
      orders: 200,
      rate: "$9/mo + $0.75/order",
      gross: "$9 + $150 = $159/mo per merchant",
      harborCost: "~$75/mo",
      net: "~$84/mo per merchant",
    },
    pros: [
      "Guaranteed base revenue even from low-volume stores",
      "Usage component still scales with success",
      "Easier to cover Harbor's fixed costs",
      "Feels fair to merchants — pay more only when you sell more",
      "Shopify Billing API natively supports this exact combo",
    ],
    cons: [
      "Monthly fee adds friction vs. pure per-order",
      "More complex to explain to merchants",
      "Need to set capped amounts that feel reasonable",
      "Two billing components to manage and debug",
    ],
    bestFor: "Balanced approach. Good if Harbor charges you a base fee plus per-use, letting you mirror their structure.",
    complexity: 4,
    predictability: 3,
    growthPotential: 4,
    launchSpeed: 3,
    color: "#f59e0b",
    icon: "⚖️",
  },
  {
    id: 4,
    name: "Percentage of Shipping Fee",
    tagline: "15–25% of what the buyer pays for locker pickup",
    howItWorks:
      "Merchant sets their own locker pickup shipping rate (e.g. $4.99). You take a percentage of that rate as your fee via usage-based billing. Merchant keeps the rest to cover Harbor + margin.",
    billingMechanism:
      "Shopify Billing API → usage-based charges. After each order, calculate your cut from the shipping line item amount and create a usageRecordCreate charge.",
    revenueExample: {
      orders: 200,
      rate: "20% of $4.99 shipping",
      gross: "$1.00 × 200 = $200/mo",
      harborCost: "$0 (merchant pays Harbor directly)",
      net: "~$200/mo",
    },
    pros: [
      "Aligns your revenue with merchant pricing decisions",
      "Merchants control their own shipping rate",
      "Scales naturally with premium pricing",
      "Can position as low-cost since it's a % not a fixed fee",
    ],
    cons: [
      "Revenue drops if merchants offer free locker pickup",
      "Merchants may resent paying you a cut of their shipping revenue",
      "Requires merchants to handle Harbor payments directly (breaks aggregator model)",
      "Harder to explain and implement",
      "If merchant sets $0 shipping, you earn $0",
    ],
    bestFor: "Marketplace model where merchants manage their own Harbor relationship. Less control for you.",
    complexity: 3,
    predictability: 2,
    growthPotential: 3,
    launchSpeed: 2,
    color: "#ec4899",
    icon: "📈",
  },
  {
    id: 5,
    name: "Freemium + Transaction Cap",
    tagline: "Free up to 20 orders/mo, then $1/order",
    howItWorks:
      "Completely free below a threshold. Once merchants exceed the cap, per-order billing kicks in automatically. Generous free tier lets merchants try without commitment.",
    billingMechanism:
      "Shopify Billing API → usage-based subscription with $0 recurring. Track order count internally. Only call usageRecordCreate for orders above the free threshold. Set capped amount for the overage.",
    revenueExample: {
      orders: 200,
      rate: "First 20 free, then $1/order",
      gross: "180 × $1 = $180/mo",
      harborCost: "~$100/mo (all 200 orders)",
      net: "~$80/mo per merchant",
    },
    pros: [
      "Maximum adoption — truly free to start",
      "Merchants grow into paying customers naturally",
      "Word of mouth from free users",
      "Simple to understand: 'free until you're successful'",
      "Great for app store rankings (high install count)",
    ],
    cons: [
      "You eat Harbor costs for all free-tier orders",
      "Many merchants may never exceed the cap",
      "Lower revenue per merchant than other models",
      "Need enough volume to make economics work",
      "Risk: 100 merchants at 15 orders each = $0 revenue but real Harbor costs",
    ],
    bestFor: "Growth hacking. Best if Harbor gives you volume discounts or if you're prioritizing market share over revenue.",
    complexity: 2,
    predictability: 2,
    growthPotential: 5,
    launchSpeed: 4,
    color: "#8b5cf6",
    icon: "🚀",
  },
];

const RatingBar = ({ value, max = 5, color }) => (
  <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
    {Array.from({ length: max }).map((_, i) => (
      <div
        key={i}
        style={{
          width: "18px",
          height: "8px",
          borderRadius: "2px",
          backgroundColor: i < value ? color : "#e2e8f0",
          transition: "background-color 0.3s ease",
        }}
      />
    ))}
  </div>
);

const MetricRow = ({ label, value, color }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
    <span style={{ fontSize: "12px", color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
    <RatingBar value={value} color={color} />
  </div>
);

export default function PricingStrategies() {
  const [selected, setSelected] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const selectedStrategy = strategies.find((s) => s.id === selected);
  const compareStrategies = strategies.filter((s) => compareIds.includes(s.id));

  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        background: "#0f172a",
        minHeight: "100vh",
        color: "#e2e8f0",
        padding: "32px 24px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div style={{ maxWidth: "1100px", margin: "0 auto 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <span style={{ fontSize: "28px" }}>🔐</span>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              background: "linear-gradient(135deg, #10b981, #6366f1)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              margin: 0,
            }}
          >
            LockerDrop Pricing Strategies
          </h1>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "14px", margin: "8px 0 20px" }}>
          5 models compared · All use Shopify Billing API · Choose based on your launch stage
        </p>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => {
              setCompareMode(false);
              setCompareIds([]);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: !compareMode ? "#6366f1" : "#334155",
              background: !compareMode ? "rgba(99,102,241,0.15)" : "transparent",
              color: !compareMode ? "#a5b4fc" : "#94a3b8",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Browse
          </button>
          <button
            onClick={() => {
              setCompareMode(true);
              setSelected(null);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: compareMode ? "#6366f1" : "#334155",
              background: compareMode ? "rgba(99,102,241,0.15)" : "transparent",
              color: compareMode ? "#a5b4fc" : "#94a3b8",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Compare (select up to 3)
          </button>
        </div>
      </div>

      {/* Strategy Cards Grid */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        {strategies.map((s) => {
          const isActive = compareMode ? compareIds.includes(s.id) : selected === s.id;
          return (
            <div
              key={s.id}
              onClick={() => (compareMode ? toggleCompare(s.id) : setSelected(s.id === selected ? null : s.id))}
              style={{
                background: isActive ? `${s.color}12` : "#1e293b",
                border: `2px solid ${isActive ? s.color : "#334155"}`,
                borderRadius: "12px",
                padding: "20px 16px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              {compareMode && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "4px",
                    border: `2px solid ${isActive ? s.color : "#475569"}`,
                    background: isActive ? s.color : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    color: "#fff",
                  }}
                >
                  {isActive && "✓"}
                </div>
              )}
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>{s.icon}</div>
              <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px", color: "#f1f5f9" }}>
                {s.name}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: s.color,
                  fontWeight: 500,
                }}
              >
                {s.tagline}
              </div>
              <div style={{ marginTop: "14px" }}>
                <MetricRow label="Complexity" value={s.complexity} color={s.color} />
                <MetricRow label="Predictability" value={s.predictability} color={s.color} />
                <MetricRow label="Growth" value={s.growthPotential} color={s.color} />
                <MetricRow label="Launch speed" value={s.launchSpeed} color={s.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Panel (Browse Mode) */}
      {!compareMode && selectedStrategy && (
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            background: "#1e293b",
            borderRadius: "16px",
            border: `1px solid ${selectedStrategy.color}33`,
            padding: "32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <span style={{ fontSize: "32px" }}>{selectedStrategy.icon}</span>
            <div>
              <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0, color: "#f1f5f9" }}>
                {selectedStrategy.name}
              </h2>
              <span
                style={{
                  fontSize: "14px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: selectedStrategy.color,
                }}
              >
                {selectedStrategy.tagline}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Left Column */}
            <div>
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  How It Works
                </h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#cbd5e1" }}>{selectedStrategy.howItWorks}</p>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Shopify Billing Implementation
                </h3>
                <div
                  style={{
                    background: "#0f172a",
                    borderRadius: "8px",
                    padding: "14px",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#a5b4fc",
                    lineHeight: 1.6,
                  }}
                >
                  {selectedStrategy.billingMechanism}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Best For
                </h3>
                <div
                  style={{
                    background: `${selectedStrategy.color}15`,
                    border: `1px solid ${selectedStrategy.color}33`,
                    borderRadius: "8px",
                    padding: "14px",
                    fontSize: "14px",
                    color: "#e2e8f0",
                    lineHeight: 1.5,
                  }}
                >
                  {selectedStrategy.bestFor}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div>
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Revenue Example (1 merchant, 200 orders/mo)
                </h3>
                <div style={{ background: "#0f172a", borderRadius: "8px", padding: "14px" }}>
                  {Object.entries(selectedStrategy.revenueExample).map(([key, val]) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: "1px solid #1e293b",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ color: "#64748b", textTransform: "capitalize" }}>
                        {key.replace(/([A-Z])/g, " $1")}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e2e8f0" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#10b981", marginBottom: "8px" }}>✓ Pros</h3>
                  {selectedStrategy.pros.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "13px",
                        color: "#cbd5e1",
                        padding: "4px 0",
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ color: "#10b981", marginRight: "6px" }}>•</span>
                      {p}
                    </div>
                  ))}
                </div>
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#f87171", marginBottom: "8px" }}>✗ Cons</h3>
                  {selectedStrategy.cons.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "13px",
                        color: "#cbd5e1",
                        padding: "4px 0",
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ color: "#f87171", marginRight: "6px" }}>•</span>
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compare Panel */}
      {compareMode && compareStrategies.length > 0 && (
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${compareStrategies.length}, 1fr)`,
              gap: "16px",
            }}
          >
            {compareStrategies.map((s) => (
              <div
                key={s.id}
                style={{
                  background: "#1e293b",
                  borderRadius: "12px",
                  border: `1px solid ${s.color}44`,
                  padding: "24px",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <span style={{ fontSize: "28px" }}>{s.icon}</span>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "8px 0 4px", color: "#f1f5f9" }}>
                    {s.name}
                  </h3>
                  <span
                    style={{
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      color: s.color,
                    }}
                  >
                    {s.tagline}
                  </span>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <MetricRow label="Complexity" value={s.complexity} color={s.color} />
                  <MetricRow label="Predictability" value={s.predictability} color={s.color} />
                  <MetricRow label="Growth potential" value={s.growthPotential} color={s.color} />
                  <MetricRow label="Launch speed" value={s.launchSpeed} color={s.color} />
                </div>

                <div
                  style={{
                    background: "#0f172a",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "16px",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ color: "#64748b", marginBottom: "4px" }}>Net per merchant (200 orders)</div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: s.color,
                    }}
                  >
                    {s.revenueExample.net}
                  </div>
                </div>

                <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>{s.bestFor}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "32px auto 0",
          background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(99,102,241,0.08))",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#a5b4fc", marginBottom: "10px" }}>
          💡 Recommendation for LockerDrop
        </h3>
        <p style={{ fontSize: "14px", color: "#cbd5e1", lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: "#10b981" }}>Launch with Strategy 1 (Pure Per-Order)</strong> — it's already half-built in your code, requires the least Billing API work, and removes all friction for early merchants.
          Once you have 15-20 active merchants and understand usage patterns, <strong style={{ color: "#f59e0b" }}>migrate to Strategy 3 (Hybrid)</strong> by adding a small base fee.
          This two-phase approach lets you validate demand before optimizing revenue. All transitions are smooth via Shopify's subscription replacement behavior.
        </p>
      </div>
    </div>
  );
}
