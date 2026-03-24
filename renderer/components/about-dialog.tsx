'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, Github, Linkedin, Twitter, Globe, Mail, Briefcase, Heart, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const TECH_STACK = [
  { name: 'Electron', color: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  { name: 'Next.js', color: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300' },
  { name: 'React', color: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  { name: 'TypeScript', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  { name: 'SQLite', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { name: 'Tailwind CSS', color: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
  { name: 'ShadCN/ui', color: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
];

const SOCIALS = [
  { icon: Globe, label: 'Portfolio', href: 'https://ianmuico.com', display: 'ianmuico.com', copyText: 'https://ianmuico.com' },
  { icon: Github, label: 'GitHub', href: 'https://github.com/mmmsss211', display: 'mmmsss211', copyText: 'https://github.com/mmmsss211' },
  { icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com/in/percival-ian-muico-37b588129/', display: 'Percival Ian Muico', copyText: 'https://www.linkedin.com/in/percival-ian-muico-37b588129/' },
  { icon: Twitter, label: 'X', href: 'https://x.com/IanMuico21', display: '@IanMuico21', copyText: 'https://x.com/IanMuico21' },
  { icon: Mail, label: 'Email', href: 'mailto:hello@ianmuico.com', display: 'hello@ianmuico.com', copyText: 'hello@ianmuico.com' },
];

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback((label: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  const handleCopysite = useCallback(() => {
    navigator.clipboard.writeText('https://ianmuico.com').then(() => {
      setCopiedKey('visit-site');
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 flex flex-col w-full sm:max-w-[440px] translate-x-[-50%] translate-y-[-50%] p-0 bg-zinc-900 shadow-xl duration-200 overflow-hidden rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
        <DialogTitle className="sr-only">About</DialogTitle>
        <DialogDescription className="sr-only">Developer and software information</DialogDescription>

        {/* ─── Cover + Avatar ────────────────────────────────── */}
        <div className="relative">
          {/* Dark cover */}
          <div className="h-28" />

          {/* Close button — plain X */}
          <DialogPrimitive.Close className="absolute right-3 top-3 p-1 text-zinc-400 hover:text-white transition-colors focus:outline-none">
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {/* Avatar — positioned to overlap the cover bottom edge */}
          <div className="absolute left-6 -bottom-12">
            <div className="w-[88px] h-[88px] border-[4px] border-background overflow-hidden bg-muted" style={{ borderRadius: '28%' }}>
              <img
                src="/developer.png"
                alt="Percival Ian Muico"
                className="w-full h-full object-cover grayscale"
              />
            </div>
          </div>
        </div>

        {/* ─── Content area with themed background ─────────── */}
        <div className="bg-background">
        {/* ─── Profile info ──────────────────────────────────── */}
        <div className="px-6 pt-14 pb-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold leading-snug">Percival Ian Muico</h3>
              <p className="text-[13px] text-muted-foreground">Full-Stack Developer</p>
            </div>
            <button
              onClick={handleCopysite}
              className="shrink-0 mt-0.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent transition-all duration-200"
            >
              {copiedKey === 'visit-site' ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  Copied
                </span>
              ) : (
                'Visit Site'
              )}
            </button>
          </div>

          <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
            Designer turned developer since 2014. Founder of{' '}
            <span className="font-medium text-foreground">The Boring Solutions</span> — a
            framework-agnostic agency focused on the right tools for each project.
          </p>
        </div>

        {/* ─── Agency ────────────────────────────────────────── */}
        <div className="px-6 py-3">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 dark:from-zinc-200 dark:to-zinc-400 flex items-center justify-center shrink-0">
              <Briefcase className="h-4 w-4 text-white dark:text-zinc-800" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight">The Boring Solutions</p>
              <p className="text-[11px] text-muted-foreground">Framework-agnostic agency</p>
            </div>
          </div>
        </div>

        {/* ─── Social links ──────────────────────────────────── */}
        <div className="px-4 pb-1">
          {SOCIALS.map((s) => {
            const isCopied = copiedKey === s.label;
            return (
              <button
                key={s.label}
                onClick={() => handleCopy(s.label, s.copyText)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-[13px] hover:bg-accent transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-accent-foreground/10 transition-colors">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className={`truncate transition-colors duration-200 ${isCopied ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                  {isCopied ? 'Copied!' : s.display}
                </span>
                <div className="ml-auto shrink-0 transition-all duration-200">
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <Separator />

        {/* ─── App info ──────────────────────────────────────── */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
              <img src="/favicon.svg" alt="App Logo" className="w-9 h-9" />
            </div>
            <div>
              <p className="text-[13px] font-semibold leading-tight">Barangay Management System</p>
              <p className="text-[11px] text-muted-foreground">v1.3 &middot; Offline-First Desktop App</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TECH_STACK.map((tech) => (
              <Badge key={tech.name} variant="secondary" className={`text-[10px] font-medium px-2 py-0.5 ${tech.color}`}>
                {tech.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* ─── Footer ────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5 py-3 border-t bg-muted/30">
          <span className="text-[10px] text-muted-foreground/50">Made with</span>
          <Heart className="h-2.5 w-2.5 text-red-400 fill-red-400" />
          <span className="text-[10px] text-muted-foreground/50">in the Philippines</span>
        </div>
        </div>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
