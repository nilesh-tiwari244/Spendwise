import React, { useMemo } from 'react';
import { format } from 'date-fns';
import type { Transaction } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface AnalyzePrintStatementProps {
  title: string;
  // Short name used in the "X will give" phrase - kept separate from title
  // so a compound "Bucket — Person" heading doesn't repeat awkwardly there.
  subject: string;
  dateRangeLabel: string;
  transactions: Transaction[];
  openingBalance: number;
  hasOpeningBalance: boolean;
  showRunningBalance: boolean;
}

type Row = {
  transaction: Transaction;
  balance: number | null;
};

type MonthGroup = {
  label: string;
  rows: Row[];
  debitTotal: number;
  creditTotal: number;
};

// Debit-heavy (negative in this app's Credit-adds/Debit-subtracts convention)
// means the balance is owed TO the account holder - shown "Dr" / "will give",
// matching how khata-style ledger statements label it.
function drCrLabel(balance: number, subject: string): { suffix: string; phrase: string } {
  if (balance < 0) return { suffix: 'Dr', phrase: `${subject} will give` };
  if (balance > 0) return { suffix: 'Cr', phrase: `You will give ${subject}` };
  return { suffix: '', phrase: 'Settled' };
}

export function AnalyzePrintStatement({
  title, subject, dateRangeLabel, transactions, openingBalance, hasOpeningBalance, showRunningBalance
}: AnalyzePrintStatementProps) {
  const { monthGroups, totalDebit, totalCredit, finalBalance } = useMemo(() => {
    const chronological = [...transactions].sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const groups = new Map<string, MonthGroup>();
    let running = openingBalance;
    let debitSum = 0;
    let creditSum = 0;

    chronological.forEach(t => {
      const amount = Number(t.amount);
      if (t.type === 'Credit') { running += amount; creditSum += amount; }
      else { running -= amount; debitSum += amount; }

      const monthKey = format(new Date(t.date), 'MMMM yyyy');
      if (!groups.has(monthKey)) {
        groups.set(monthKey, { label: monthKey, rows: [], debitTotal: 0, creditTotal: 0 });
      }
      const group = groups.get(monthKey)!;
      group.rows.push({ transaction: t, balance: showRunningBalance ? running : null });
      if (t.type === 'Credit') group.creditTotal += amount;
      else group.debitTotal += amount;
    });

    return {
      monthGroups: Array.from(groups.values()),
      totalDebit: debitSum,
      totalCredit: creditSum,
      finalBalance: running
    };
  }, [transactions, openingBalance, showRunningBalance]);

  const netForSummary = showRunningBalance ? finalBalance : totalCredit - totalDebit;
  const netLabel = drCrLabel(netForSummary, subject);

  return (
    <div className="hidden print:block text-black">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold">{title} Statement</h1>
        <p className="text-sm text-gray-600 mt-1">{dateRangeLabel}</p>
      </div>

      <div className="border border-gray-300 rounded grid grid-cols-4 divide-x divide-gray-300 mb-4 text-center">
        <div className="p-3">
          <div className="text-xs text-gray-500">Opening Balance</div>
          <div className="font-bold text-sm mt-1">{hasOpeningBalance ? formatCurrency(Math.abs(openingBalance)) : '—'}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-gray-500">Total Debit(-)</div>
          <div className="font-bold text-sm mt-1">{formatCurrency(totalDebit)}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-gray-500">Total Credit(+)</div>
          <div className="font-bold text-sm mt-1">{formatCurrency(totalCredit)}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-gray-500">Net Balance</div>
          <div className={`font-bold text-sm mt-1 ${netForSummary < 0 ? 'text-red-600' : netForSummary > 0 ? 'text-green-700' : ''}`}>
            {formatCurrency(Math.abs(netForSummary))} {netLabel.suffix}
          </div>
          {netLabel.phrase !== 'Settled' && <div className="text-[10px] text-gray-500">({netLabel.phrase})</div>}
        </div>
      </div>

      <p className="text-xs text-gray-600 mb-2">No. of Entries: {transactions.length}</p>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100 border border-gray-300">
            <th className="border border-gray-300 p-2 text-left w-20">Date</th>
            <th className="border border-gray-300 p-2 text-left">Details</th>
            <th className="border border-gray-300 p-2 text-right w-24">Debit(-)</th>
            <th className="border border-gray-300 p-2 text-right w-24">Credit(+)</th>
            {showRunningBalance && <th className="border border-gray-300 p-2 text-right w-28">Balance</th>}
          </tr>
        </thead>
        <tbody>
          {hasOpeningBalance && monthGroups.length > 0 && (
            <tr className="border border-gray-300">
              <td colSpan={showRunningBalance ? 5 : 4} className="border border-gray-300 p-2 font-bold bg-gray-50">
                {monthGroups[0].label}
                <span className="font-normal text-gray-500 float-right">
                  (Opening Balance: {formatCurrency(Math.abs(openingBalance))})
                </span>
              </td>
            </tr>
          )}
          {monthGroups.map((group, gi) => (
            <React.Fragment key={group.label}>
              {!(hasOpeningBalance && gi === 0) && (
                <tr className="border border-gray-300">
                  <td colSpan={showRunningBalance ? 5 : 4} className="border border-gray-300 p-2 font-bold bg-gray-50">
                    {group.label}
                  </td>
                </tr>
              )}
              {group.rows.map(({ transaction: t, balance }) => (
                <tr key={t.id} className="border border-gray-300 break-inside-avoid">
                  <td className="border border-gray-300 p-2 align-top">{format(new Date(t.date), 'dd MMM')}</td>
                  <td className="border border-gray-300 p-2 align-top">{t.remarks || t.category?.name || '—'}</td>
                  <td className="border border-gray-300 p-2 text-right align-top">{t.type === 'Debit' ? formatCurrency(Number(t.amount)) : ''}</td>
                  <td className="border border-gray-300 p-2 text-right align-top">{t.type === 'Credit' ? formatCurrency(Number(t.amount)) : ''}</td>
                  {showRunningBalance && balance !== null && (
                    <td className={`border border-gray-300 p-2 text-right align-top font-bold ${balance < 0 ? 'text-red-600' : balance > 0 ? 'text-green-700' : ''}`}>
                      {formatCurrency(Math.abs(balance))} {drCrLabel(balance, '').suffix}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border border-gray-300 bg-gray-50 font-bold">
                <td className="border border-gray-300 p-2" colSpan={2}>{group.label} Total</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(group.debitTotal)}</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(group.creditTotal)}</td>
                {showRunningBalance && <td className="border border-gray-300 p-2" />}
              </tr>
            </React.Fragment>
          ))}
          <tr className="border-t-2 border-gray-800 font-bold">
            <td className="border border-gray-300 p-2" colSpan={2}>Grand Total</td>
            <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalDebit)}</td>
            <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalCredit)}</td>
            {showRunningBalance && (
              <td className={`border border-gray-300 p-2 text-right ${finalBalance < 0 ? 'text-red-600' : finalBalance > 0 ? 'text-green-700' : ''}`}>
                {formatCurrency(Math.abs(finalBalance))} {netLabel.suffix}
              </td>
            )}
          </tr>
        </tbody>
      </table>

      <p className="text-[10px] text-gray-400 mt-3">
        Report Generated: {format(new Date(), 'h:mm a')} | {format(new Date(), "dd MMM''yy")}
      </p>
    </div>
  );
}
