'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Landmark, Plus, Search, PenLine, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TEMPLATE_VARIABLES } from '@/lib/constants';
import { getAPI, type Official } from '@/lib/ipc';
import { prettyRole, roleKeyFromPosition } from './serialize';
import type { ChipKind } from './extensions';

const RESIDENT_KEYS = new Set([
  'fullName', 'firstName', 'middleName', 'lastName', 'suffix', 'middleInitial',
  'purok', 'address', 'birthDate', 'age', 'gender', 'civilStatus', 'contactNumber',
  'email', 'occupation', 'voterStatus', 'bloodType', 'partnerName', 'religion',
  'citizenship', 'philsysCardNo', 'educationalAttainment',
]);
const BARANGAY_KEYS = new Set(['barangay', 'barangayAddress', 'municipality', 'province']);
const BUSINESS_KEYS = new Set(['businessName', 'businessNature', 'businessAddress', 'businessPurok', 'businessOwners', 'businessStatus', 'businessDateRegistered']);
const DATE_KEYS = new Set(['date', 'dateOrdinal', 'year']);

interface VariableSidebarProps {
  editor: Editor | null;
}

export function VariableSidebar({ editor }: VariableSidebarProps) {
  const [search, setSearch] = useState('');
  const [officials, setOfficials] = useState<Official[]>([]);
  const [inputField, setInputField] = useState('');

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getOfficials().then((list: Official[]) => {
      setOfficials(list.filter(o => o.is_active));
    }).catch(() => {});
  }, []);

  const insertChip = (kind: ChipKind, key: string, label: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent([
      { type: 'variableChip', attrs: { kind, key, label } },
      { type: 'text', text: ' ' },
    ]).run();
  };

  const insertHeader = () => {
    if (!editor) return;
    editor.chain().focus().insertContentAt(0, { type: 'headerBlock' }).run();
  };

  const addInputField = () => {
    const key = inputField.trim().replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_|_$/g, '');
    if (!key) return;
    insertChip('input', key, `✎ ${key}`);
    setInputField('');
  };

  const q = search.trim().toLowerCase();
  const matches = (label: string, key: string) =>
    !q || label.toLowerCase().includes(q) || key.toLowerCase().includes(q);

  const groups: { title: string; keys: Set<string> }[] = [
    { title: 'Resident', keys: RESIDENT_KEYS },
    { title: 'Business', keys: BUSINESS_KEYS },
    { title: 'Barangay', keys: BARANGAY_KEYS },
    { title: 'Date', keys: DATE_KEYS },
  ];

  return (
    <div className="w-64 shrink-0 border-l bg-background flex flex-col overflow-hidden">
      <div className="p-3 border-b space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Insert into document</p>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={insertHeader}>
          <Landmark className="mr-2 h-4 w-4" /> Barangay Letterhead
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Officials — live from the Officials page */}
        {(!q || 'officials signatory'.includes(q)) && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Current Officials
            </p>
            {officials.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active officials. Add them in the Officials page.</p>
            ) : (
              <div className="space-y-1.5">
                {officials.map((o) => {
                  const name = [o.first_name, o.last_name].filter(Boolean).join(' ') || '(no resident linked)';
                  const roleKey = roleKeyFromPosition(o.position);
                  return (
                    <div key={o.id} className="rounded border p-2">
                      <p className="text-xs font-medium truncate" title={name}>{name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{o.position}</p>
                      <div className="mt-1.5 flex gap-1">
                        <Button
                          variant="secondary" size="sm" className="h-6 flex-1 text-[10px] px-1"
                          title="Insert signature block (name over a line, position below)"
                          onClick={() => insertChip('signatory', roleKey, `✍ ${prettyRole(roleKey)}`)}
                        >
                          <PenLine className="mr-1 h-3 w-3" /> Signature
                        </Button>
                        <Button
                          variant="secondary" size="sm" className="h-6 flex-1 text-[10px] px-1"
                          title="Insert the official's name inline in the text"
                          onClick={() => insertChip('official', roleKey, prettyRole(roleKey))}
                        >
                          <User className="mr-1 h-3 w-3" /> Name
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
              Resolves to whoever holds the position when the document is generated.
            </p>
          </div>
        )}

        {/* Custom input field */}
        {(!q || 'custom input field'.includes(q)) && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Custom Input Field
            </p>
            <div className="flex gap-1">
              <Input
                value={inputField}
                onChange={(e) => setInputField(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInputField(); } }}
                placeholder="e.g. purpose"
                className="h-7 text-xs"
              />
              <Button size="sm" className="h-7 px-2" onClick={addInputField}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
              Asked as a fill-in box when generating the document.
            </p>
          </div>
        )}

        {/* Variable groups */}
        {groups.map((group) => {
          const items = TEMPLATE_VARIABLES.filter(v => group.keys.has(v.key) && matches(v.label, v.key));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-1">
                {items.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={v.description}
                    onClick={() => insertChip('var', v.key, v.label)}
                    className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
