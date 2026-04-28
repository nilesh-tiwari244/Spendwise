import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy');
}

export function getDateParts(date: string | Date) {
  const d = new Date(date);
  return {
    day: format(d, 'dd'),
    month: format(d, 'MMM'),
    year: format(d, 'yyyy')
  };
}

export function formatUserDisplay(email: string, bucketOwnerEmail: string, activeShareEmails: string[], profiles: Record<string, string>) {
  if (!email) return 'Unknown';
  
  const displayName = profiles[email];
  const displayValue = displayName || email;

  if (email === bucketOwnerEmail) return displayValue;
  if (activeShareEmails.includes(email)) return displayValue;
  return `${displayValue} (Removed)`;
}

export function truncateRemarks(remarks: string | undefined | null): string {
  if (!remarks) return '';
  if (remarks.length <= 23) return remarks;
  return remarks.substring(0, 23) + '...';
}

export function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const val = row[header];
        const escaped = ('' + val).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ];
  
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
