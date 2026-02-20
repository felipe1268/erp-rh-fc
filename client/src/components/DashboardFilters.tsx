import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";

interface DashboardFiltersProps {
  selectedCompany: string;
  setSelectedCompany: (v: string) => void;
  selectedYear?: number;
  setSelectedYear?: (v: number) => void;
  showYear?: boolean;
  children?: React.ReactNode;
}

export function DashboardFilters({
  selectedCompany,
  setSelectedCompany,
  selectedYear,
  setSelectedYear,
  showYear = true,
  children,
}: DashboardFiltersProps) {
  const { data: companies } = trpc.companies.list.useQuery();

  useEffect(() => {
    if (companies && companies.length > 0 && !selectedCompany) {
      setSelectedCompany(String(companies[0].id));
    }
  }, [companies, selectedCompany, setSelectedCompany]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={selectedCompany} onValueChange={setSelectedCompany}>
        <SelectTrigger className="w-56 bg-card border-border">
          <SelectValue placeholder="Selecione a empresa" />
        </SelectTrigger>
        <SelectContent>
          {companies?.map(c => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.nomeFantasia || c.razaoSocial}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showYear && setSelectedYear ? (
        <Select value={String(selectedYear || currentYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-32 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {children}
    </div>
  );
}

// Stat card component
interface StatCardProps {
  title: string;
  value: number | string;
  color?: string;
  subtitle?: string;
  alert?: boolean;
}

export function StatCard({ title, value, color = "text-foreground", subtitle, alert }: StatCardProps) {
  return (
    <div className={`bg-card rounded-lg border border-border p-4 ${alert ? "ring-2 ring-red-300" : ""}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {subtitle ? <p className="text-xs text-muted-foreground mt-1">{subtitle}</p> : null}
    </div>
  );
}

// Empty state
export function EmptyDashboard({ message = "Selecione uma empresa para visualizar o dashboard." }: { message?: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-16 text-center">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
