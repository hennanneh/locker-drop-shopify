import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area, AreaChart, ReferenceLine } from 'recharts';

// ============================================
// NORMALIZED ANNUAL BUDGET REFERENCE
// ============================================
// Based on HOA Expenses Normalized spreadsheet (from GL)
// 2025 actual normalized expenses
//
// MONTHLY BUDGET ITEMS:
//   Landscaping (Sundrop)    $351.67/mo  $4,220/yr
//   Trash                    $327.77/mo  $3,933/yr  (actual avg)
//   Management               $150.00/mo  $1,800/yr
//   Electricity               $49.00/mo    $588/yr  (actual avg)
//   QuickBooks/Software       $38.91/mo    $467/yr  (actual avg)
//   Water                     $15.19/mo    $182/yr  (actual avg)
//   Monthly subtotal:        $932.54/mo $11,191/yr
//
// ANNUAL BUDGET ITEMS:
//   Insurance                          $16,415/yr
//   Pest Control                          $677/yr
//   Fire Extinguishers                    $122/yr
//   Annual subtotal:                   $17,214/yr
//
// NON-BUDGET / EXTRA:
//   Extra Landscaping & Trees           $3,292/yr
//   Repairs & Maintenance               $1,011/yr
//   Non-budget subtotal:                $4,303/yr
//
// ─────────────────────────────────────────────
// 2025 OPERATING TOTAL:               $32,707/yr
// 2025 Regular Dues Income:           $30,724/yr
// 2025 DEFICIT:                       -$1,983/yr
// ============================================

// Income/Expense data - from HOA Expenses Normalized spreadsheet
// Operating expenses only (excludes special assessment projects)
// 2024/2025 normalized: Landscaping $351.67/mo, Management $150/mo assumed
const incomeExpenseData = [
  { year: '2022', income: 28352, expenses: 25008, net: 3344 },
  { year: '2023', income: 30724, expenses: 27827, net: 2897 },
  { year: '2024', income: 30724, expenses: 31763, net: -1039 },
  { year: '2025', income: 30724, expenses: 32707, net: -1983 }
];

// 2025 NORMALIZED expenses - from HOA Expenses Normalized spreadsheet
// Budget items + actual non-budget operational costs (excl special assessment)
const expense2025 = [
  { name: 'Insurance', value: 16415, color: '#2563eb' },
  { name: 'Landscaping', value: 4220, color: '#16a34a' },
  { name: 'Trash', value: 3933, color: '#9333ea' },
  { name: 'Extra Landscaping & Trees', value: 3292, color: '#84cc16' },
  { name: 'Management', value: 1800, color: '#4f46e5' },
  { name: 'Repairs', value: 1011, color: '#f97316' },
  { name: 'Pest Control', value: 677, color: '#0891b2' },
  { name: 'Electricity', value: 588, color: '#eab308' },
  { name: 'QuickBooks', value: 467, color: '#ec4899' },
  { name: 'Water', value: 182, color: '#06b6d4' },
  { name: 'Fire Extinguishers', value: 122, color: '#f97316' },
];

// Expense by year - OPERATING EXPENSES ONLY (excludes special assessment projects)
// From HOA Expenses Normalized spreadsheet
// 2024/2025: Landscaping & Management normalized to $351.67/mo & $150/mo
const expenseByYear = [
  { year: '2022', Insurance: 11182, Trash: 5837, Landscaping: 1758, Management: 1275, Utilities: 626, Other: 4330 },
  { year: '2023', Insurance: 14653, Trash: 4736, Landscaping: 4220, Management: 2025, Utilities: 688, Other: 1505 },
  { year: '2024', Insurance: 16364, Trash: 4214, Landscaping: 4220, Management: 1800, Utilities: 691, Other: 4474 },
  { year: '2025', Insurance: 16415, Trash: 3933, Landscaping: 4220, Management: 1800, Utilities: 770, Other: 5569 }
];

// Cash balance history (monthly)
const cashBalanceHistory = [
  { month: 'Jan 22', balance: 24567 },
  { month: 'Jun 22', balance: 17167 },
  { month: 'Dec 22', balance: 25461 },
  { month: 'May 23', balance: 31961 },
  { month: 'Jun 23', balance: 18815 },
  { month: 'Aug 23', balance: 9225 },
  { month: 'Dec 23', balance: 16337 },
  { month: 'May 24', balance: 6484 },
  { month: 'Jun 24', balance: 12181 },
  { month: 'Dec 24', balance: 24061 },
  { month: 'May 25', balance: 27601 },
  { month: 'Jun 25', balance: 10521 },
  { month: 'Dec 25', balance: 20472 },
  { month: 'Feb 26', balance: 20479 },
];

// Detailed monthly balance for 2024-2026
const detailedBalance = [
  { month: 'Jan 24', balance: 16491 },
  { month: 'Feb 24', balance: 16947 },
  { month: 'Mar 24', balance: 18843 },
  { month: 'Apr 24', balance: 20558 },
  { month: 'May 24', balance: 6484, note: 'Insurance' },
  { month: 'Jun 24', balance: 12181 },
  { month: 'Jul 24', balance: 15256 },
  { month: 'Aug 24', balance: 16348 },
  { month: 'Sep 24', balance: 17967 },
  { month: 'Oct 24', balance: 22302 },
  { month: 'Nov 24', balance: 23380 },
  { month: 'Dec 24', balance: 24061 },
  { month: 'Jan 25', balance: 25121 },
  { month: 'Feb 25', balance: 27143 },
  { month: 'Mar 25', balance: 23727 },
  { month: 'Apr 25', balance: 26410 },
  { month: 'May 25', balance: 27601 },
  { month: 'Jun 25', balance: 10521, note: 'Insurance' },
  { month: 'Jul 25', balance: 12840 },
  { month: 'Aug 25', balance: 15676 },
  { month: 'Sep 25', balance: 14089 },
  { month: 'Oct 25', balance: 16639 },
  { month: 'Nov 25', balance: 17688 },
  { month: 'Dec 25', balance: 20472 },
  { month: 'Jan 26', balance: 20395 },
  { month: 'Feb 26', balance: 20479 },
];

// 2023 Assessment data
const assessmentData = {
  totalAssessed: 24397.12,
  payments: [
    { date: '07/17/2023', vendor: 'Caballero Contracting', amount: 9231.05, description: 'Check 323' },
    { date: '07/26/2023', vendor: 'Caballero Contracting', amount: 9231.05, description: 'Check 324' },
    { date: '08/11/2023', vendor: 'Caballero Contracting', amount: 2672.88, description: 'Check 325' },
    { date: '08/21/2023', vendor: 'Caballero Contracting', amount: 2672.88, description: 'Check 326' },
    { date: '09/06/2025', vendor: 'Miguel Caballero', amount: 850.00, description: 'Zelle - follow-up' },
  ],
  ownerStatus: [
    { owner: 'Shaunice Williams', unit: '101', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'Sayaka Makishima', unit: '102', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'Kelsey Johnson', unit: '103', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'Tim Mock', unit: '104', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'Eddie Bell', unit: '105', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'Scott Johnson', unit: '106', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'McMahon', unit: '107', assessed: 3049.64, paid: 3049.64, balance: 0 },
    { owner: 'Anne Howrey', unit: '108', assessed: 3049.64, paid: 3049.64, balance: 0 },
  ]
};

// Fee increase scenarios (based on normalized 2025 actual: $32,707 expenses)
// Current position: -$1,983 annual DEFICIT
const feeScenarios = [
  { increase: 'Current', standard: 307.44, corner: 357.84, monthlyIncome: 2560, surplus: -165, annualReserve: -1983 },
  { increase: '10%', standard: 338.18, corner: 393.62, monthlyIncome: 2816, surplus: 91, annualReserve: 1089 },
  { increase: '15%', standard: 353.56, corner: 411.52, monthlyIncome: 2944, surplus: 219, annualReserve: 2625 },
  { increase: '20%', standard: 368.93, corner: 429.41, monthlyIncome: 3072, surplus: 347, annualReserve: 4161 },
];

// Monthly budget - from HOA Expenses Normalized spreadsheet - sorted highest to lowest
const monthlyBudget = [
  { category: 'Insurance', monthly: 1368, annual: 16415, type: 'Annual (June)', color: '#2563eb' },
  { category: 'Landscaping', monthly: 352, annual: 4220, type: 'Monthly (Sundrop)', color: '#16a34a' },
  { category: 'Trash', monthly: 328, annual: 3933, type: 'Monthly', color: '#9333ea' },
  { category: 'Management', monthly: 150, annual: 1800, type: 'Monthly', color: '#4f46e5' },
  { category: 'Extra Landscaping & Trees', monthly: 274, annual: 3292, type: 'As needed', color: '#84cc16' },
  { category: 'Pest Control', monthly: 56, annual: 677, type: 'Annual', color: '#0891b2' },
  { category: 'Electricity', monthly: 49, annual: 588, type: 'Monthly', color: '#eab308' },
  { category: 'QuickBooks', monthly: 39, annual: 467, type: 'Monthly', color: '#ec4899' },
  { category: 'Water', monthly: 15, annual: 182, type: 'Monthly', color: '#06b6d4' },
  { category: 'Fire Extinguishers', monthly: 10, annual: 122, type: 'Annual', color: '#f97316' },
];

const insuranceTrend = [
  { year: '2022', amount: 11182 },
  { year: '2023', amount: 14653 },
  { year: '2024', amount: 16364 },
  { year: '2025', amount: 16415 }
];

const formatCurrency = (value) => `$${value.toLocaleString()}`;

export default function HOAFinancialDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  
  const totalMonthlyNeed = monthlyBudget.reduce((sum, item) => sum + item.monthly, 0);
  const monthlyIncome = 2560;
  const monthlySurplus = monthlyIncome - totalMonthlyNeed;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">4130 Wycliff Ave HOA</h1>
          <p className="text-gray-500">Financial Dashboard • 2022-2025</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['overview', 'reserves', 'fee increase', '2026 projects', 'expenses', 'budget', 'trends', 'policy', 'assessment'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'assessment' ? '2023 Assessment' : tab === 'fee increase' ? 'Fee Increase' : tab === '2026 projects' ? '2026 Projects' : tab === 'policy' ? 'Policy Discussion' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">Annual Income</p>
                <p className="text-2xl font-bold text-green-600">$30,724</p>
                <p className="text-xs text-gray-400 mt-1">Regular dues only</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">Annual Expenses</p>
                <p className="text-2xl font-bold text-red-600">$32,707</p>
                <p className="text-xs text-gray-400 mt-1">2025 normalized actual</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">Current Cash</p>
                <p className="text-2xl font-bold text-blue-600">$20,479</p>
                <p className="text-xs text-blue-500 mt-1">Feb 7, 2026</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">Annual Deficit</p>
                <p className="text-2xl font-bold text-red-600">-$1,983</p>
                <p className="text-xs text-red-500 mt-1">Expenses exceed dues by 6.5%</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Annual Income vs Expenses (Normalized)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={incomeExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="net" name="Net Income" stroke="#2563eb" strokeWidth={3} dot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">
                  <strong>✓ Important:</strong> With actual normalized expenses from the GL, we are running a deficit of ~$1,983/year. A fee increase is needed to cover operating costs and build reserves for capital projects.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">2025 Actual Expense Breakdown (Normalized)</h2>
                <p className="text-xs text-gray-500 mb-2 italic">From HOA Expenses Normalized spreadsheet • Excl. special assessment</p>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={expense2025}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {expense2025.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">2025 Expenses by Category</h2>
                <p className="text-xs text-gray-500 mb-4 italic">Sorted highest to lowest • Includes non-budget operational items</p>
                <div className="space-y-3">
                  {expense2025.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-gray-700">{item.name}</span>
                      </div>
                      <span className="font-semibold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-3 mt-3 flex justify-between font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(expense2025.reduce((sum, i) => sum + i.value, 0))}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Operating Expenses by Year</h2>
              <p className="text-xs text-gray-500 mb-2 italic">Excludes 2023 special assessment capital project</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={expenseByYear}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="Insurance" stackId="a" fill="#2563eb" />
                  <Bar dataKey="Trash" stackId="a" fill="#9333ea" />
                  <Bar dataKey="Landscaping" stackId="a" fill="#16a34a" />
                  <Bar dataKey="Management" stackId="a" fill="#4f46e5" />
                  <Bar dataKey="Utilities" stackId="a" fill="#eab308" />
                  <Bar dataKey="Other" stackId="a" fill="#6b7280" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Budget Tab */}
        {activeTab === 'budget' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Monthly Budget Breakdown</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyBudget} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="category" width={100} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="monthly" radius={[0, 4, 4, 0]}>
                      {monthlyBudget.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Monthly Summary</h2>
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-600">Monthly Expenses</p>
                    <p className="text-2xl font-bold text-red-700">${totalMonthlyNeed.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600">Monthly Income</p>
                    <p className="text-2xl font-bold text-green-700">${monthlyIncome.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-red-100 rounded-lg border-2 border-red-300">
                    <p className="text-sm text-red-600">Monthly Shortfall</p>
                    <p className="text-2xl font-bold text-red-700">${monthlySurplus.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">2026 Normalized Budget by Payment Frequency</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold text-blue-600 mb-2">Monthly</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Landscaping (Sundrop) - $352</li>
                    <li>• Trash & Recycling - $344</li>
                    <li>• HOA Management - $150</li>
                    <li>• Electricity - $51</li>
                    <li>• Software - $41</li>
                    <li>• Water - $16</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-2">Total: $954/mo</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold text-green-600 mb-2">As Needed</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Repairs - ~$100/mo avg</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-2">($1,200/year budget)</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold text-purple-600 mb-2">Annual</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Insurance - $17,236 (June)</li>
                    <li>• Pest Control - $697</li>
                    <li>• Tax Prep - $262</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-2">Total: $18,195/year</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 italic">* Landscaping is Sundrop contract only. Extra trimming/plants are separate.</p>
            </div>
          </div>
        )}

        {/* Reserves Tab */}
        {activeTab === 'reserves' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">Current Balance</p>
                <p className="text-2xl font-bold text-blue-600">$20,479</p>
                <p className="text-xs text-gray-400 mt-1">Feb 2026</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">All-Time High</p>
                <p className="text-2xl font-bold text-green-600">$31,961</p>
                <p className="text-xs text-green-500 mt-1">May 2023</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">All-Time Low</p>
                <p className="text-2xl font-bold text-red-600">$6,484</p>
                <p className="text-xs text-red-500 mt-1">May 2024 😬</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-sm text-gray-500 mb-1">Reserve Level</p>
                <p className="text-2xl font-bold text-amber-600">7.5 mo</p>
                <p className="text-xs text-amber-500 mt-1">Target: 6+ months</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Cash Balance History (2024-2026)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={detailedBalance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} domain={[0, 30000]} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#colorBalance)" />
                  <ReferenceLine y={15000} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} label={{ value: '$15K Target', position: 'right', fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 flex gap-4">
                <div className="p-3 bg-red-50 rounded-lg flex-1">
                  <p className="text-xs text-red-600 font-medium">⚠️ May 2024: $6,484</p>
                  <p className="text-xs text-gray-500">After insurance payment - dangerously low!</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg flex-1">
                  <p className="text-xs text-red-600 font-medium">⚠️ Jun 2025: $10,521</p>
                  <p className="text-xs text-gray-500">After insurance payment - still tight</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Reserve Fund Recommendations</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-700 mb-3">Industry Standards</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between p-3 bg-gray-50 rounded">
                      <span>3 months (minimum)</span>
                      <span className="font-semibold">$8,177</span>
                    </div>
                    <div className="flex justify-between p-3 bg-blue-50 rounded border border-blue-200">
                      <span>6 months (recommended)</span>
                      <span className="font-semibold">$16,354</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded">
                      <span>12 months (ideal)</span>
                      <span className="font-semibold">$32,707</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700 mb-3">Current Status</h3>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-800 mb-2">
                      Current reserves: <strong>$20,479</strong> (7.5 months)
                    </p>
                    <p className="text-sm text-amber-700">
                      ✓ Above 6-month target<br/>
                      ⚠️ But drops to ~2 months after June insurance payment!
                    </p>
                  </div>
                  <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-red-800 font-medium">Critical Issue:</p>
                    <p className="text-sm text-red-700 mt-1">
                      Every June, insurance (~$16,400) depletes reserves. 
                      In May 2024, we dropped to just $6,484 - barely 2 months of expenses!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fee Increase Tab */}
        {activeTab === 'fee increase' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Current Financial Position</h2>
              <div className="grid grid-cols-2 gap-6 mt-4">
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h3 className="font-semibold text-red-800 mb-2">Current Financial Position</h3>
                  <ul className="text-sm text-red-700 space-y-2">
                    <li>• Annual income: $30,724</li>
                    <li>• Annual expenses: $32,707</li>
                    <li>• <strong>Annual deficit: -$1,983</strong></li>
                    <li>• 106.5% of income spent on operations</li>
                  </ul>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h3 className="font-semibold text-amber-800 mb-2">Why Consider an Increase?</h3>
                  <ul className="text-sm text-amber-700 space-y-2">
                    <li>• $1,983 deficit = reserves shrinking each year</li>
                    <li>• Insurance increased 47% since 2022</li>
                    <li>• June insurance payment strains reserves</li>
                    <li>• Carport repairs need special assessment</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Fee Increase Scenarios</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3">Increase</th>
                      <th className="text-right p-3">Standard Unit</th>
                      <th className="text-right p-3">Corner Unit</th>
                      <th className="text-right p-3">Monthly Income</th>
                      <th className="text-right p-3">Monthly Surplus</th>
                      <th className="text-right p-3">Annual Reserve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeScenarios.map((scenario, idx) => (
                      <tr key={idx} className={`border-t ${idx === 0 ? 'bg-red-50' : idx === 1 ? 'bg-amber-50' : idx === 2 || idx === 3 ? 'bg-green-50' : ''}`}>
                        <td className="p-3 font-medium">{scenario.increase}</td>
                        <td className="p-3 text-right">${scenario.standard.toFixed(2)}</td>
                        <td className="p-3 text-right">${scenario.corner.toFixed(2)}</td>
                        <td className="p-3 text-right">${scenario.monthlyIncome.toLocaleString()}</td>
                        <td className={`p-3 text-right font-medium ${scenario.surplus < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${scenario.surplus.toLocaleString()}
                        </td>
                        <td className={`p-3 text-right ${scenario.annualReserve < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${scenario.annualReserve.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-800">Board Recommendation: 15–20% Increase</h3>
                <p className="text-sm text-green-700 mt-1">
                  A <strong>10% increase</strong> ($338/$394) barely breaks even — only $1,089/year to reserves.<br/>
                  A <strong>15% increase</strong> ($354/$412) adds $2,625/year to reserves — covers the deficit and starts rebuilding.<br/>
                  A <strong>20% increase</strong> ($369/$429) adds $4,161/year — strongest buffer against rising insurance and future repairs.
                </p>
                <p className="text-sm text-green-700 mt-2">
                  With a $1,983 annual operating deficit, a <strong>15–20% increase is the recommended range</strong> to 
                  cover current shortfalls, rebuild reserves after the June insurance payment, and prepare for capital projects.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Impact Comparison</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={feeScenarios.slice(1)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <YAxis type="category" dataKey="increase" width={60} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="annualReserve" name="Annual Reserve Building" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">How Our Fees Compare to Dallas Area</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-700 mb-3">Pecan Court Current Fees</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between p-3 bg-blue-50 rounded-lg">
                      <span>Standard Units (6)</span>
                      <span className="font-semibold text-blue-700">$307/month</span>
                    </div>
                    <div className="flex justify-between p-3 bg-blue-50 rounded-lg">
                      <span>Corner Units (2)</span>
                      <span className="font-semibold text-blue-700">$358/month</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg mt-4">
                      <span>Unit values</span>
                      <span className="font-semibold">~$400,000 each</span>
                    </div>
                  </div>
                  
                  <h3 className="font-medium text-gray-700 mt-6 mb-3">Dallas Condo/Townhome Averages</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between p-3 bg-gray-50 rounded">
                      <span>Dallas condos (typical)</span>
                      <span className="font-semibold">$300-$500/mo</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded">
                      <span>Dallas townhomes</span>
                      <span className="font-semibold">$200-$300/mo</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded">
                      <span>Dallas overall average</span>
                      <span className="font-semibold">$250-$450/mo</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded">
                      <span>National condo average</span>
                      <span className="font-semibold">$300-$400/mo</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200 mb-4">
                    <h3 className="font-semibold text-green-800 mb-2">✓ We're Competitive</h3>
                    <p className="text-sm text-green-700">
                      Our fees of $307-$358/month are <strong>in line with Dallas condo averages</strong> 
                      and include full coverage:
                    </p>
                    <ul className="text-sm text-green-700 mt-2 ml-4 list-disc">
                      <li>Full building insurance (~$17K/year)</li>
                      <li>Landscaping & grounds maintenance</li>
                      <li>Trash service</li>
                      <li>Pest control</li>
                      <li>Common area repairs</li>
                      <li>Management</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-800 mb-2">After 15–20% Increase</h3>
                    <div className="space-y-2 mt-3">
                      <div className="flex justify-between">
                        <span className="text-sm">Standard units (15%):</span>
                        <span className="font-semibold text-blue-700">$354/month</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Corner units (15%):</span>
                        <span className="font-semibold text-blue-700">$412/month</span>
                      </div>
                      <div className="flex justify-between mt-1 pt-1 border-t border-blue-200">
                        <span className="text-sm">Standard units (20%):</span>
                        <span className="font-semibold text-blue-700">$369/month</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Corner units (20%):</span>
                        <span className="font-semibold text-blue-700">$429/month</span>
                      </div>
                    </div>
                    <p className="text-sm text-blue-700 mt-3">
                      Still <strong>well within the normal Dallas condo range</strong> of $300–$500/month.
                      For $400K units, fees under 1% of property value annually ($333/mo) are considered reasonable.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">
                  Sources: Bay Management Group Texas (2025), KnoxRE Dallas, U.S. Census Bureau, HOA Start 2025 Guide
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2026 Projects Tab */}
        {activeTab === '2026 projects' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">2026 Capital Projects</h2>
              <p className="text-gray-500 mb-6">Special assessment needed - quotes in progress</p>
              
              <div className="p-4 bg-red-50 rounded-lg border border-red-200 mb-6">
                <h3 className="font-semibold text-red-800 mb-2">⚠️ Priority: Carports</h3>
                <p className="text-sm text-red-700">
                  Ice storm destroyed approximately 50% of carports. Need to repair/replace ASAP.
                  Insurance claim filed for damaged portion.
                </p>
              </div>

              <h3 className="font-semibold text-gray-700 mb-3">Damage Documentation</h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <img src="/outputs/carport_damage.jpeg" alt="Carport collapse from ice storm" className="w-full h-48 object-cover rounded-lg border" />
                  <p className="text-xs text-gray-500 mt-2 text-center">Carport collapsed under ice/snow weight</p>
                </div>
                <div>
                  <img src="/outputs/tree_problem.jpeg" alt="Tree growing through carport" className="w-full h-48 object-cover rounded-lg border" />
                  <p className="text-xs text-gray-500 mt-2 text-center">Tree grown through carport — must remove before rebuild</p>
                </div>
              </div>

              <h3 className="font-semibold text-gray-700 mb-3">Projects Needed</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3">Project</th>
                      <th className="text-right p-3">Estimate Range</th>
                      <th className="text-left p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-3 font-medium">New Carports + Fascia</td>
                      <td className="p-3 text-right">$26,000 – $35,000</td>
                      <td className="p-3"><span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">Getting quotes</span></td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-3 font-medium">Tree Removal</td>
                      <td className="p-3 text-right">$1,750</td>
                      <td className="p-3"><span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Quote received</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800"><strong>Quote received:</strong> $26,000 for carports + fascia combined</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Insurance Coverage Details (ACIC Policy)</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600 font-medium">Carport Coverage (Bldg #2 "Canopy")</p>
                  <p className="text-2xl font-bold text-blue-700">$15,000</p>
                  <p className="text-xs text-gray-500">Actual Cash Value • Non-Combustible</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <p className="text-sm text-amber-600 font-medium">Deductible</p>
                  <p className="text-2xl font-bold text-amber-700">$2,500</p>
                  <p className="text-xs text-gray-500">Wind/Hail: 3% (min $2,500)</p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border mb-4">
                <h3 className="font-semibold text-gray-700 mb-2">Estimated Insurance Payout</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between"><span>Carport limit (ACV)</span><span>$15,000</span></div>
                  <div className="flex justify-between"><span>Less deductible</span><span className="text-red-600">–$2,500</span></div>
                  <div className="flex justify-between"><span>Less ACV depreciation (est. 20–40%)</span><span className="text-red-600">–$3,000 to –$6,000</span></div>
                  <div className="flex justify-between border-t pt-1 font-bold"><span>Estimated payout</span><span>$6,500 – $9,500</span></div>
                </div>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h3 className="font-semibold text-amber-800 mb-2">Key Policy Notes</h3>
                <ul className="text-sm text-amber-700 space-y-2">
                  <li>• Carport is insured as "Canopy" (Bldg #2), separate from condo buildings</li>
                  <li>• ACV valuation means depreciation reduces payout — not replacement cost</li>
                  <li>• Condo buildings covered at $519,000 each (Bldg #1 & #3)</li>
                  <li>• Carrier: Atlantic Casualty Insurance Co. (ACIC)</li>
                  <li>• Policy term: 04/28/2025 – 04/28/2026</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Estimated Special Assessment</h2>
              <p className="text-sm text-gray-500 mb-4">Keeping $15,000+ in reserves — no reserve funds used for capital projects</p>
              
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3">Item</th>
                      <th className="text-right p-3">Low Estimate</th>
                      <th className="text-right p-3">High Estimate</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-3">Carports + Fascia</td>
                      <td className="p-3 text-right">$26,000</td>
                      <td className="p-3 text-right">$35,000</td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-3">Tree Removal</td>
                      <td className="p-3 text-right">$1,750</td>
                      <td className="p-3 text-right">$1,750</td>
                    </tr>
                    <tr className="border-t font-medium">
                      <td className="p-3">Total Project Cost</td>
                      <td className="p-3 text-right">$27,750</td>
                      <td className="p-3 text-right">$36,750</td>
                    </tr>
                    <tr className="border-t text-green-700">
                      <td className="p-3">Less: Est. Insurance Payout</td>
                      <td className="p-3 text-right">–$6,500</td>
                      <td className="p-3 text-right">–$9,500</td>
                    </tr>
                    <tr className="border-t bg-blue-50 font-bold">
                      <td className="p-3">Net Cost to HOA</td>
                      <td className="p-3 text-right">$18,250</td>
                      <td className="p-3 text-right">$30,250</td>
                    </tr>
                    <tr className="border-t bg-amber-50 font-bold text-lg">
                      <td className="p-3">Per Unit (÷ 8)</td>
                      <td className="p-3 text-right">$2,281</td>
                      <td className="p-3 text-right">$3,781</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-500">Similar to 2023 assessment ($3,049/unit). Insurance payout depends on adjuster's ACV depreciation assessment.</p>
            </div>
          </div>
        )}

        {/* Policy Discussion Tab */}
        {activeTab === 'policy' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Policy Discussion</h2>
              <p className="text-gray-500 mb-6">Items requiring board/owner input</p>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-6">
                <h3 className="font-semibold text-blue-800 mb-2">📋 Recent Issue: Water Pipe Break</h3>
                <p className="text-sm text-blue-700">
                  A corner unit had a water line break. Per our Bylaws (Section F.9), the pipe repair was the owner's responsibility. 
                  This was resolved, but it raised questions about common area restoration.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">What If: Pipe Break in the Courtyard?</h2>
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-700 mb-2">Current Rules</h3>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• <strong>Bylaws F.9:</strong> "Water line for that unit" = owner responsibility</li>
                    <li>• <strong>Declaration D.4:</strong> Pipes crossing boundaries = Limited Common Elements (owner's)</li>
                    <li>• <strong>Gap:</strong> Who pays to restore common area after excavation?</li>
                  </ul>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <h3 className="font-semibold text-amber-700 mb-2">The Scenario</h3>
                  <ul className="text-sm text-amber-600 space-y-2">
                    <li>• Water line breaks under courtyard</li>
                    <li>• Owner pays for pipe repair ✓</li>
                    <li>• Excavation tears up shared courtyard</li>
                    <li>• Restoration could cost $2,000-$5,000+</li>
                    <li>• <strong>Who pays?</strong></li>
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-800 mb-2">Board Approach</h3>
                <p className="text-sm text-blue-700">
                  These situations will be evaluated on a <strong>case-by-case basis</strong> by the Board, 
                  considering the specific circumstances, costs involved, and fairness to all parties.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2023 Assessment Tab */}
        {activeTab === 'assessment' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">2023 Special Assessment</h2>
              <p className="text-gray-500 mb-6">Major repairs - Caballero Contracting</p>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600">Total Assessed</p>
                  <p className="text-2xl font-bold text-blue-700">${assessmentData.totalAssessed.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">$3,049.64 × 8 units</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600">Total Spent</p>
                  <p className="text-2xl font-bold text-red-700">
                    ${assessmentData.payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Including follow-up work</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600">Owner Status</p>
                  <p className="text-2xl font-bold text-green-700">All Paid</p>
                  <p className="text-xs text-gray-500">8/8 owners paid in full</p>
                </div>
              </div>

              <h3 className="font-semibold text-gray-700 mb-3">Payments Made</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Vendor</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-left p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessmentData.payments.map((payment, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-3">{payment.date}</td>
                        <td className="p-3">{payment.vendor}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(payment.amount)}</td>
                        <td className="p-3 text-gray-500">{payment.description}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-gray-50 font-bold">
                      <td className="p-3" colSpan={2}>Total</td>
                      <td className="p-3 text-right">
                        {formatCurrency(assessmentData.payments.reduce((sum, p) => sum + p.amount, 0))}
                      </td>
                      <td className="p-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Trends Tab */}
        {activeTab === 'trends' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Insurance Cost Trend</h2>
              <p className="text-sm text-gray-500 mb-4">Increased 47% from 2022-2025</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={insuranceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} domain={[10000, 18000]} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={{ r: 6, fill: '#2563eb' }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-4 gap-4 text-center">
                {insuranceTrend.map((item, idx) => (
                  <div key={item.year} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">{item.year}</p>
                    <p className="font-bold text-blue-600">{formatCurrency(item.amount)}</p>
                    {idx > 0 && (
                      <p className="text-xs text-gray-400">
                        +{(((item.amount - insuranceTrend[idx-1].amount) / insuranceTrend[idx-1].amount) * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">📈 Positive Trends</h2>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-gray-700"><strong>Trash costs down 44%</strong> - $5,837 → $3,933</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-gray-700"><strong>Insurance stabilized</strong> - Only 0.3% increase in 2025</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-gray-700"><strong>2023 Assessment complete</strong> - All owners paid</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-gray-700"><strong>Reserves rebuilt</strong> - Back to 7.5 months</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">⚠️ Action Needed</h2>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">!</span>
                    <span className="text-gray-700"><strong>Fee increase required</strong> - Currently -$165/month deficit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500">!</span>
                    <span className="text-gray-700"><strong>June insurance</strong> - Will drop reserves significantly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500">!</span>
                    <span className="text-gray-700"><strong>Shop insurance</strong> - Get quotes before June renewal</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
