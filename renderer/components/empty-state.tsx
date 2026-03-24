'use client';

import { type LucideIcon, Users, FileText, LayoutDashboard, UserPlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  illustration?: 'dashboard' | 'residents' | 'templates';
}

// Warm SVG illustrations — abstract, friendly shapes in the brand palette
function DashboardIllustration() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none" className="mb-4">
      {/* Bar chart bars */}
      <rect x="20" y="60" width="20" height="40" rx="4" fill="#8b5cf6" opacity="0.2" />
      <rect x="50" y="40" width="20" height="60" rx="4" fill="#3b82f6" opacity="0.3" />
      <rect x="80" y="50" width="20" height="50" rx="4" fill="#10b981" opacity="0.25" />
      <rect x="110" y="30" width="20" height="70" rx="4" fill="#f59e0b" opacity="0.2" />
      {/* Curved line over bars */}
      <path d="M 25 55 Q 55 20, 90 45 T 125 25" stroke="#8b5cf6" strokeWidth="2.5" fill="none" opacity="0.4" strokeLinecap="round" />
      {/* Decorative circles */}
      <circle cx="30" cy="55" r="3" fill="#8b5cf6" opacity="0.5" />
      <circle cx="60" cy="35" r="3" fill="#3b82f6" opacity="0.5" />
      <circle cx="90" cy="45" r="3" fill="#10b981" opacity="0.5" />
      <circle cx="120" cy="25" r="3" fill="#f59e0b" opacity="0.5" />
      {/* Base line */}
      <line x1="15" y1="100" x2="145" y2="100" stroke="currentColor" opacity="0.1" strokeWidth="1.5" />
    </svg>
  );
}

function ResidentsIllustration() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none" className="mb-4">
      {/* Group of people silhouettes */}
      {/* Person 1 - center */}
      <circle cx="80" cy="35" r="14" fill="#8b5cf6" opacity="0.2" />
      <rect x="66" y="52" width="28" height="35" rx="14" fill="#8b5cf6" opacity="0.15" />
      {/* Person 2 - left */}
      <circle cx="45" cy="42" r="11" fill="#3b82f6" opacity="0.2" />
      <rect x="34" y="56" width="22" height="28" rx="11" fill="#3b82f6" opacity="0.15" />
      {/* Person 3 - right */}
      <circle cx="115" cy="42" r="11" fill="#10b981" opacity="0.2" />
      <rect x="104" y="56" width="22" height="28" rx="11" fill="#10b981" opacity="0.15" />
      {/* Small plus icon */}
      <circle cx="140" cy="30" r="10" fill="#f59e0b" opacity="0.15" />
      <line x1="136" y1="30" x2="144" y2="30" stroke="#f59e0b" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
      <line x1="140" y1="26" x2="140" y2="34" stroke="#f59e0b" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
      {/* Base line */}
      <line x1="25" y1="95" x2="135" y2="95" stroke="currentColor" opacity="0.1" strokeWidth="1.5" />
    </svg>
  );
}

function TemplatesIllustration() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none" className="mb-4">
      {/* Document stack */}
      {/* Back document */}
      <rect x="50" y="15" width="70" height="90" rx="6" fill="#3b82f6" opacity="0.1" />
      {/* Middle document */}
      <rect x="45" y="10" width="70" height="90" rx="6" fill="#8b5cf6" opacity="0.15" />
      {/* Front document */}
      <rect x="40" y="5" width="70" height="90" rx="6" fill="currentColor" opacity="0.05" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      {/* Text lines on front */}
      <rect x="52" y="20" width="35" height="3" rx="1.5" fill="#8b5cf6" opacity="0.3" />
      <rect x="52" y="30" width="46" height="2" rx="1" fill="currentColor" opacity="0.1" />
      <rect x="52" y="37" width="42" height="2" rx="1" fill="currentColor" opacity="0.1" />
      <rect x="52" y="44" width="38" height="2" rx="1" fill="currentColor" opacity="0.1" />
      <rect x="52" y="55" width="30" height="3" rx="1.5" fill="#10b981" opacity="0.25" />
      <rect x="52" y="63" width="44" height="2" rx="1" fill="currentColor" opacity="0.1" />
      <rect x="52" y="70" width="40" height="2" rx="1" fill="currentColor" opacity="0.1" />
      {/* Seal/stamp */}
      <circle cx="90" cy="82" r="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeOpacity="0.2" strokeWidth="1" />
    </svg>
  );
}

const illustrations = {
  dashboard: DashboardIllustration,
  residents: ResidentsIllustration,
  templates: TemplatesIllustration,
};

export function EmptyState({
  title,
  message,
  primaryAction,
  secondaryAction,
  illustration,
}: EmptyStateProps) {
  const Illustration = illustration ? illustrations[illustration] : null;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {Illustration && <Illustration />}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
        {message}
      </p>
      <div className="flex gap-3">
        {secondaryAction && (
          <Button variant="outline" onClick={secondaryAction.onClick}>
            {secondaryAction.icon && <secondaryAction.icon className="mr-2 h-4 w-4" />}
            {secondaryAction.label}
          </Button>
        )}
        {primaryAction && (
          <Button onClick={primaryAction.onClick}>
            <UserPlus className="mr-2 h-4 w-4" />
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
