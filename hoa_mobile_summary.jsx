import React, { useState } from 'react';

const fmt = (v) => `$${v.toLocaleString()}`;

const sections = [
  {
    id: 'overview',
    title: 'Financial Overview',
    emoji: '📊',
    content: () => (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Annual Income" value="$30,724" color="green" />
          <Stat label="Annual Expenses" value="$32,707" color="red" />
          <Stat label="Cash on Hand" value="$20,479" sub="Feb 2026" color="blue" />
          <Stat label="Annual Deficit" value="-$1,983" sub="106.5% of income" color="red" />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">We're spending more than we bring in. A fee increase is needed to cover the gap and rebuild reserves.</p>
        </div>
      </div>
    )
  },
  {
    id: 'reserves',
    title: 'Reserves',
    emoji: '🏦',
    content: () => (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Current Balance" value="$20,479" color="blue" />
          <Stat label="Reserve Level" value="7.5 months" sub="Target: 6+ months" color="green" />
        </div>
        <Bullet items={[
          { text: 'Current balance looks OK at 7.5 months', icon: '✓', color: 'green' },
          { text: 'June insurance (~$16,400) drops us to ~$4,000 — barely 1.5 months', icon: '⚠️', color: 'red' },
          { text: '$15,000 is the minimum safe floor', icon: '📍', color: 'blue' },
          { text: 'May 2024 we hit $6,484 — dangerously low', icon: '⚠️', color: 'amber' },
        ]} />
      </div>
    )
  },
  {
    id: 'fees',
    title: 'Fee Increase',
    emoji: '💰',
    content: () => (
      <div className="space-y-3">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-red-800">Board recommends 15–20% increase</p>
          <p className="text-xs text-red-700 mt-1">Needed to cover $1,983 annual deficit and rebuild reserves</p>
        </div>
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-100">
              <th className="text-left p-2">Increase</th>
              <th className="text-right p-2">Standard</th>
              <th className="text-right p-2">Corner</th>
              <th className="text-right p-2">Annual Reserve</th>
            </tr></thead>
            <tbody>
              <FeeRow label="Current" std="$307" corner="$358" reserve="-$1,983" bg="bg-red-50" negative />
              <FeeRow label="10%" std="$338" corner="$394" reserve="+$1,089" bg="bg-amber-50" />
              <FeeRow label="15%" std="$354" corner="$412" reserve="+$2,625" bg="bg-green-50" rec />
              <FeeRow label="20%" std="$369" corner="$429" reserve="+$4,161" bg="bg-green-50" rec />
            </tbody>
          </table>
        </div>
        <Bullet items={[
          { text: 'Even at 20%, our fees are within the Dallas condo average ($300–$500/mo)', icon: '✓', color: 'green' },
          { text: 'Insurance has risen 47% since 2022 — biggest cost driver', icon: '📈', color: 'blue' },
        ]} />
      </div>
    )
  },
  {
    id: 'projects',
    title: '2026 Projects',
    emoji: '🔨',
    content: () => (
      <div className="space-y-3">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-red-800">⚠️ Carport repairs needed — ice storm damage</p>
        </div>
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-100">
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Low</th>
              <th className="text-right p-2">High</th>
            </tr></thead>
            <tbody>
              <tr className="border-t"><td className="p-2">Carports + Fascia</td><td className="p-2 text-right">$26,000</td><td className="p-2 text-right">$35,000</td></tr>
              <tr className="border-t"><td className="p-2">Tree Removal</td><td className="p-2 text-right">$1,750</td><td className="p-2 text-right">$1,750</td></tr>
              <tr className="border-t text-green-700"><td className="p-2">Est. Insurance Payout</td><td className="p-2 text-right">–$9,500</td><td className="p-2 text-right">–$6,500</td></tr>
              <tr className="border-t bg-blue-50 font-bold"><td className="p-2">Net Cost to HOA</td><td className="p-2 text-right">$18,250</td><td className="p-2 text-right">$30,250</td></tr>
              <tr className="border-t bg-amber-50 font-bold"><td className="p-2">Per Unit (÷ 8)</td><td className="p-2 text-right">$2,281</td><td className="p-2 text-right">$3,781</td></tr>
            </tbody>
          </table>
        </div>
        <Bullet items={[
          { text: 'Carport insured for $15,000 (ACV) with $2,500 deductible', icon: '📋', color: 'blue' },
          { text: 'ACV depreciation will reduce payout — adjuster TBD', icon: '⚠️', color: 'amber' },
          { text: 'Similar to 2023 assessment ($3,049/unit — all paid)', icon: '✓', color: 'green' },
        ]} />
      </div>
    )
  },
  {
    id: 'expenses',
    title: 'Where the Money Goes',
    emoji: '📋',
    content: () => (
      <div className="space-y-2">
        <p className="text-xs text-gray-500 mb-1">2025 normalized expenses — $32,707 total</p>
        <ExpenseBar label="Insurance" amount={16415} total={32707} color="#2563eb" />
        <ExpenseBar label="Landscaping" amount={4220} total={32707} color="#16a34a" />
        <ExpenseBar label="Trash" amount={3933} total={32707} color="#9333ea" />
        <ExpenseBar label="Extra Land. & Trees" amount={3292} total={32707} color="#84cc16" />
        <ExpenseBar label="Management" amount={1800} total={32707} color="#4f46e5" />
        <ExpenseBar label="Repairs" amount={1011} total={32707} color="#f97316" />
        <ExpenseBar label="Other" amount={2036} total={32707} color="#6b7280" />
        <div className="pt-2 border-t mt-2">
          <p className="text-xs text-gray-500">Insurance alone is 50% of all expenses</p>
        </div>
      </div>
    )
  },
  {
    id: 'insurance',
    title: 'Insurance Trend',
    emoji: '📈',
    content: () => (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-1">
          {[
            { yr: '2022', amt: '$11,182' },
            { yr: '2023', amt: '$14,653' },
            { yr: '2024', amt: '$16,364' },
            { yr: '2025', amt: '$16,415' },
          ].map(d => (
            <div key={d.yr} className="text-center p-2 bg-blue-50 rounded">
              <p className="text-xs text-gray-500">{d.yr}</p>
              <p className="text-xs font-bold text-blue-700">{d.amt}</p>
            </div>
          ))}
        </div>
        <Bullet items={[
          { text: 'Up 47% from 2022 to 2024', icon: '📈', color: 'red' },
          { text: 'Stabilized in 2025 — only +0.3% increase', icon: '✓', color: 'green' },
          { text: '2026 renewal: $14,312 (property) + $2,103 (liability) = $16,415', icon: '📋', color: 'blue' },
        ]} />
      </div>
    )
  },
];

function Stat({ label, value, sub, color }) {
  const colors = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-lg p-2.5 ${colors[color]?.split(' ')[0] || 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base font-bold ${colors[color]?.split(' ')[1] || ''}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Bullet({ items }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-xs mt-0.5 shrink-0">{item.icon}</span>
          <span className="text-xs text-gray-700">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function FeeRow({ label, std, corner, reserve, bg, negative, rec }) {
  return (
    <tr className={`border-t ${bg || ''}`}>
      <td className={`p-2 font-medium ${rec ? 'text-green-800' : ''}`}>{label}{rec ? ' ✓' : ''}</td>
      <td className="p-2 text-right">{std}</td>
      <td className="p-2 text-right">{corner}</td>
      <td className={`p-2 text-right font-medium ${negative ? 'text-red-600' : 'text-green-600'}`}>{reserve}</td>
    </tr>
  );
}

function ExpenseBar({ label, amount, total, color }) {
  const pct = ((amount / total) * 100).toFixed(0);
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{fmt(amount)} <span className="text-gray-400">({pct}%)</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function HOAMobileSummary() {
  const [open, setOpen] = useState(sections.map((_, i) => i === 0));

  const toggle = (idx) => {
    setOpen(prev => prev.map((v, i) => i === idx ? !v : v));
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-800">4130 Wycliff Ave HOA</h1>
        <p className="text-xs text-gray-500">Annual Meeting Summary • Feb 2026</p>
      </div>
      
      <div className="p-3 space-y-2">
        {sections.map((section, idx) => (
          <div key={section.id} className="bg-white rounded-xl border overflow-hidden">
            <button
              onClick={() => toggle(idx)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{section.emoji}</span>
                <span className="text-sm font-semibold text-gray-800">{section.title}</span>
              </div>
              <span className="text-gray-400 text-sm">{open[idx] ? '−' : '+'}</span>
            </button>
            {open[idx] && (
              <div className="px-3 pb-3">
                {section.content()}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="p-3 text-center">
        <p className="text-xs text-gray-400">Pecan Court Condominiums • 8 Units</p>
      </div>
    </div>
  );
}
