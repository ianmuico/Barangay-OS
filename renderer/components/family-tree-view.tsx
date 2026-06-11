'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { type Resident, type TreeResident } from '@/lib/ipc';
import { getGradientForId, getInitials } from '@/lib/constants';

// ─── Constants ───
const CARD_W = 160;
const CARD_H = 140;
const H_GAP = 60;
const V_GAP = 180;
const PAIR_GAP = 24;
const MAX_GENERATIONS = 100;
// Performance guard: the canvas renders at most this many people. BFS expands
// closest-relatives-first, so anything cut off is the farthest connections.
const MAX_NODES = 300;

// ─── Gender helper ───
export function fullGender(g: string): string {
  if (!g) return 'Unknown';
  const lower = g.toLowerCase();
  if (lower === 'm' || lower === 'male') return 'Male';
  if (lower === 'f' || lower === 'female') return 'Female';
  return g;
}

function buildName(r: { first_name: string; last_name: string; suffix?: string | null }): string {
  return [r.first_name, r.last_name, r.suffix].filter(Boolean).join(' ');
}

// ─── Role badge colors ───
const roleBadgeColors: Record<string, string> = {
  'You': 'bg-primary/15 text-primary',
  'Partner': 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300',
  'Mother': 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
  'Father': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  'Sibling': 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Child': 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  'Grandparent': 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Great-Grandparent': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
  'Grandchild': 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
  'Great-Grandchild': 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
  'Aunt/Uncle': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Niece/Nephew': 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
  'Cousin': 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  'Spouse': 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300',
  'Relative': 'bg-muted text-muted-foreground',
};

// ─── Person Node component ───
function PersonNode({ data }: { data: any }) {
  const [c1, c2] = getGradientForId(data.personId || 0);
  const initials = getInitials(data.label);
  const isYou = data.role === 'You';

  return (
    <div
      className="bg-card text-card-foreground transition-shadow hover:shadow-lg cursor-pointer"
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        border: `2px solid ${c1}30`,
        boxShadow: isYou ? `0 0 0 3px ${c1}25` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />

      <div className="flex flex-col items-center justify-center h-full px-2 py-3 gap-1">
        <div
          className="flex items-center justify-center text-white font-bold text-xs"
          style={{
            width: 40, height: 40, borderRadius: '22%',
            background: `linear-gradient(135deg, ${c1}, ${c2})`,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <p className="text-xs font-semibold leading-tight text-center truncate w-full mt-0.5">
          {data.label}
        </p>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${roleBadgeColors[data.role] || 'bg-muted text-muted-foreground'}`}>
          {data.role}
        </span>
        <p className="text-[10px] text-muted-foreground">
          {fullGender(data.gender)} · {data.age} yrs
        </p>
      </div>
    </div>
  );
}

// ─── Junction Node ───
function JunctionNode() {
  return (
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--border))' }}>
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none', width: 6, height: 6, left: '50%', top: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none', width: 6, height: 6, left: '50%', top: 0 }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: 'transparent', border: 'none', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: 'transparent', border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { person: PersonNode, junction: JunctionNode };

// ─── Edge styles ───
const familyEdgeStyle = { stroke: 'hsl(var(--border))', strokeWidth: 1.5 };
const partnerEdgeStyle = { stroke: '#ec4899', strokeWidth: 1.5, strokeDasharray: '6 4' };

// ─── Tree data ───
interface TreeData {
  allResidents: TreeResident[];
  residentMap: Map<number, TreeResident>;
  childrenByParent: Map<number, TreeResident[]>;
}

export function buildTreeData(allResidents: TreeResident[]): TreeData {
  const residentMap = new Map<number, TreeResident>();
  const childrenByParent = new Map<number, TreeResident[]>();
  for (const r of allResidents) {
    residentMap.set(r.id, r);
  }
  for (const r of allResidents) {
    for (const pid of [r.mother_id, r.father_id]) {
      if (!pid) continue;
      const list = childrenByParent.get(pid);
      if (list) list.push(r);
      else childrenByParent.set(pid, [r]);
    }
  }
  return { allResidents, residentMap, childrenByParent };
}

function getChildren(tree: TreeData, parentId: number): TreeResident[] {
  return tree.childrenByParent.get(parentId) || [];
}

// ─── How many generations of real data exist around this person ───
function dataDepths(person: TreeResident, tree: TreeData): { up: number; down: number } {
  function countUp(p: TreeResident, visited: Set<number>): number {
    if (visited.has(p.id) || visited.size > 5000) return 0;
    visited.add(p.id);
    let max = 0;
    for (const pid of [p.mother_id, p.father_id]) {
      if (!pid) continue;
      const parent = tree.residentMap.get(pid);
      if (parent) max = Math.max(max, 1 + countUp(parent, visited));
    }
    return max;
  }

  function countDown(personId: number, visited: Set<number>): number {
    if (visited.has(personId) || visited.size > 5000) return 0;
    visited.add(personId);
    const p = tree.residentMap.get(personId);
    const kids = [...getChildren(tree, personId)];
    if (p?.partner_id) {
      for (const k of getChildren(tree, p.partner_id)) {
        if (!kids.find(c => c.id === k.id)) kids.push(k);
      }
    }
    let max = 0;
    for (const kid of kids) {
      if (!visited.has(kid.id)) max = Math.max(max, 1 + countDown(kid.id, visited));
    }
    return max;
  }

  return {
    up: Math.min(countUp(person, new Set()), MAX_GENERATIONS),
    down: Math.min(countDown(person.id, new Set()), MAX_GENERATIONS),
  };
}

// ─── Relationship labels relative to the center person ──────────────────────
function computeRoles(center: TreeResident, tree: TreeData, included: Map<number, number>): Map<number, string> {
  const roles = new Map<number, string>();

  // Walk lineage up/down (only through blood links) to label direct line
  const ancestorLevel = new Map<number, number>();
  {
    let frontier = [center];
    for (let lv = 1; lv <= MAX_GENERATIONS && frontier.length; lv++) {
      const next: TreeResident[] = [];
      for (const p of frontier) {
        for (const pid of [p.mother_id, p.father_id]) {
          if (!pid || ancestorLevel.has(pid)) continue;
          const parent = tree.residentMap.get(pid);
          if (!parent) continue;
          ancestorLevel.set(pid, lv);
          next.push(parent);
        }
      }
      frontier = next;
    }
  }
  const descendantLevel = new Map<number, number>();
  {
    let frontier = [center.id];
    const seen = new Set<number>([center.id]);
    for (let lv = 1; lv <= MAX_GENERATIONS && frontier.length; lv++) {
      const next: number[] = [];
      for (const pid of frontier) {
        for (const child of getChildren(tree, pid)) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          descendantLevel.set(child.id, lv);
          next.push(child.id);
        }
      }
      frontier = next;
    }
  }

  const isSibling = (r: TreeResident) =>
    r.id !== center.id &&
    ((center.mother_id && r.mother_id === center.mother_id) ||
     (center.father_id && r.father_id === center.father_id));

  const parentIds = [center.mother_id, center.father_id].filter(Boolean) as number[];
  const isAuntUncle = (r: TreeResident) => {
    if (parentIds.includes(r.id) || ancestorLevel.has(r.id)) return false;
    for (const pid of parentIds) {
      const parent = tree.residentMap.get(pid);
      if (!parent) continue;
      if ((parent.mother_id && r.mother_id === parent.mother_id) ||
          (parent.father_id && r.father_id === parent.father_id)) return true;
    }
    return false;
  };

  const siblingIds = new Set<number>();
  const auntUncleIds = new Set<number>();
  for (const id of Array.from(included.keys())) {
    const r = tree.residentMap.get(id);
    if (!r) continue;
    if (isSibling(r)) siblingIds.add(id);
    else if (isAuntUncle(r)) auntUncleIds.add(id);
  }

  for (const id of Array.from(included.keys())) {
    const r = tree.residentMap.get(id)!;
    if (id === center.id) { roles.set(id, 'You'); continue; }
    if (id === center.partner_id) { roles.set(id, 'Partner'); continue; }
    const anc = ancestorLevel.get(id);
    if (anc !== undefined) {
      roles.set(id, anc === 1 ? (fullGender(r.gender) === 'Female' ? 'Mother' : 'Father')
        : anc === 2 ? 'Grandparent' : anc === 3 ? 'Great-Grandparent' : `Ancestor ·${anc}`);
      continue;
    }
    const desc = descendantLevel.get(id);
    if (desc !== undefined) {
      roles.set(id, desc === 1 ? 'Child' : desc === 2 ? 'Grandchild' : desc === 3 ? 'Great-Grandchild' : `Descendant ·${desc}`);
      continue;
    }
    if (siblingIds.has(id)) { roles.set(id, 'Sibling'); continue; }
    if (auntUncleIds.has(id)) { roles.set(id, 'Aunt/Uncle'); continue; }
    // Niece/Nephew: child of a sibling · Cousin: child of an aunt/uncle
    if ((r.mother_id && siblingIds.has(r.mother_id)) || (r.father_id && siblingIds.has(r.father_id))) {
      roles.set(id, 'Niece/Nephew'); continue;
    }
    if ((r.mother_id && auntUncleIds.has(r.mother_id)) || (r.father_id && auntUncleIds.has(r.father_id))) {
      roles.set(id, 'Cousin'); continue;
    }
    // Married into the family
    if (r.partner_id && included.has(r.partner_id)) { roles.set(id, 'Spouse'); continue; }
    roles.set(id, 'Relative');
  }
  return roles;
}

// ─── Full-network builder ────────────────────────────────────────────────────
// Expands EVERY connection (parents, children, partners — which transitively
// reaches siblings, their spouses and children, aunts/uncles, cousins,
// in-laws, ...) bounded by `maxGens` generations up/down and MAX_NODES people.
function buildFamilyNetwork(center: TreeResident, tree: TreeData, maxGens: number) {
  // 1. BFS with generation levels (+1 per generation up, -1 per generation down)
  const levelOf = new Map<number, number>();
  const order: number[] = [];
  let truncated = false;

  levelOf.set(center.id, 0);
  order.push(center.id);
  const queue: number[] = [center.id];

  const tryAdd = (id: number | null | undefined, lvl: number) => {
    if (!id || levelOf.has(id) || !tree.residentMap.has(id)) return;
    if (lvl > maxGens || lvl < -maxGens) return;
    if (levelOf.size >= MAX_NODES) { truncated = true; return; }
    levelOf.set(id, lvl);
    order.push(id);
    queue.push(id);
  };

  while (queue.length > 0) {
    const id = queue.shift()!;
    const lv = levelOf.get(id)!;
    const p = tree.residentMap.get(id)!;
    tryAdd(p.mother_id, lv + 1);
    tryAdd(p.father_id, lv + 1);
    tryAdd(p.partner_id, lv);
    for (const child of getChildren(tree, id)) tryAdd(child.id, lv - 1);
  }

  // 2. Group partners on the same level into couple units
  interface Unit { members: number[]; level: number; x: number }
  const unitOf = new Map<number, Unit>();
  const unitsByLevel = new Map<number, Unit[]>();
  for (const id of order) {
    if (unitOf.has(id)) continue;
    const lv = levelOf.get(id)!;
    const p = tree.residentMap.get(id)!;
    const members = [id];
    if (p.partner_id && levelOf.get(p.partner_id) === lv && !unitOf.has(p.partner_id)) {
      members.push(p.partner_id);
    }
    const unit: Unit = { members, level: lv, x: 0 };
    for (const m of members) unitOf.set(m, unit);
    const row = unitsByLevel.get(lv);
    if (row) row.push(unit);
    else unitsByLevel.set(lv, [unit]);
  }

  const unitWidth = (u: Unit) => u.members.length * CARD_W + (u.members.length - 1) * PAIR_GAP;

  // 3. Order units within each row by the average position of their relatives
  //    in adjacent rows (barycenter sweeps), then pack left-to-right.
  const rowIndex = new Map<Unit, number>();
  const levels = Array.from(unitsByLevel.keys()).sort((a, b) => b - a); // top row first
  for (const lv of levels) {
    unitsByLevel.get(lv)!.forEach((u, i) => rowIndex.set(u, i));
  }

  const parentUnitsOf = (u: Unit): Unit[] => {
    const result: Unit[] = [];
    for (const m of u.members) {
      const r = tree.residentMap.get(m)!;
      for (const pid of [r.mother_id, r.father_id]) {
        if (pid && unitOf.has(pid)) {
          const pu = unitOf.get(pid)!;
          if (pu !== u && !result.includes(pu)) result.push(pu);
        }
      }
    }
    return result;
  };
  const childUnitsOf = (u: Unit): Unit[] => {
    const result: Unit[] = [];
    for (const m of u.members) {
      for (const child of getChildren(tree, m)) {
        if (unitOf.has(child.id)) {
          const cu = unitOf.get(child.id)!;
          if (cu !== u && !result.includes(cu)) result.push(cu);
        }
      }
    }
    return result;
  };

  const sortRow = (lv: number, neighborFn: (u: Unit) => Unit[]) => {
    const row = unitsByLevel.get(lv)!;
    const keyed = row.map((u) => {
      const neighbors = neighborFn(u);
      const avg = neighbors.length
        ? neighbors.reduce((sum, n) => sum + (rowIndex.get(n) ?? 0), 0) / neighbors.length
        : rowIndex.get(u) ?? 0;
      return { u, avg };
    });
    keyed.sort((a, b) => a.avg - b.avg);
    keyed.forEach(({ u }, i) => rowIndex.set(u, i));
    unitsByLevel.set(lv, keyed.map(k => k.u));
  };

  for (let iter = 0; iter < 2; iter++) {
    for (let i = 1; i < levels.length; i++) sortRow(levels[i], parentUnitsOf);     // top → bottom
    for (let i = levels.length - 2; i >= 0; i--) sortRow(levels[i], childUnitsOf); // bottom → top
  }

  // 4. Assign x positions: pack each row, then nudge rows (outward from the
  //    center row) so they align under/over their relatives.
  const centerX = 0;
  for (const lv of levels) {
    const row = unitsByLevel.get(lv)!;
    const totalW = row.reduce((sum, u) => sum + unitWidth(u), 0) + (row.length - 1) * H_GAP;
    let cursor = centerX - totalW / 2;
    for (const u of row) {
      u.x = cursor;
      cursor += unitWidth(u) + H_GAP;
    }
  }
  const sortedByDistance = levels.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const lv of sortedByDistance) {
    if (lv === 0) continue;
    const row = unitsByLevel.get(lv)!;
    const deltas: number[] = [];
    for (const u of row) {
      const anchors = lv > 0 ? childUnitsOf(u) : parentUnitsOf(u);
      const inward = anchors.filter(a => Math.abs(a.level) < Math.abs(lv));
      if (inward.length) {
        const target = inward.reduce((sum, a) => sum + a.x + unitWidth(a) / 2, 0) / inward.length;
        deltas.push(target - (u.x + unitWidth(u) / 2));
      }
    }
    if (deltas.length) {
      const shift = deltas.reduce((s, d) => s + d, 0) / deltas.length;
      for (const u of row) u.x += shift;
    }
  }

  // 5. Emit nodes and edges
  const roles = computeRoles(center, tree, levelOf);
  const topLevel = Math.max(...levels);
  const yOf = (lv: number) => (topLevel - lv) * V_GAP;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodePos = new Map<number, { x: number; y: number }>();

  for (const lv of levels) {
    for (const u of unitsByLevel.get(lv)!) {
      u.members.forEach((m, i) => {
        const person = tree.residentMap.get(m)!;
        const x = u.x + i * (CARD_W + PAIR_GAP);
        const y = yOf(lv);
        nodePos.set(m, { x, y });
        nodes.push({
          id: `p-${m}`, type: 'person', position: { x, y },
          data: { label: buildName(person), role: roles.get(m) || 'Relative', gender: person.gender, age: person.age || 0, personId: m },
        });
      });
      // Partner edge inside the couple unit
      if (u.members.length === 2) {
        edges.push({
          id: `e-pair-${u.members[0]}-${u.members[1]}`,
          source: `p-${u.members[0]}`, target: `p-${u.members[1]}`,
          sourceHandle: 'right', targetHandle: 'left',
          type: 'straight', style: partnerEdgeStyle,
        });
      }
    }
  }

  // Cross-level partner links (rare, from inconsistent data) still get a line
  for (const id of order) {
    const p = tree.residentMap.get(id)!;
    if (p.partner_id && levelOf.has(p.partner_id) && unitOf.get(id) !== unitOf.get(p.partner_id)) {
      const edgeId = `e-xpair-${Math.min(id, p.partner_id)}-${Math.max(id, p.partner_id)}`;
      if (!edges.find(e => e.id === edgeId)) {
        edges.push({ id: edgeId, source: `p-${id}`, target: `p-${p.partner_id}`, type: 'straight', style: partnerEdgeStyle });
      }
    }
  }

  // Parent-child connections via one junction per parent pair
  let junctionCount = 0;
  const junctionByParents = new Map<string, string>();
  for (const id of order) {
    const r = tree.residentMap.get(id)!;
    const parents = [r.mother_id, r.father_id].filter(pid => pid && levelOf.has(pid!)) as number[];
    if (parents.length === 0) continue;
    const key = parents.slice().sort((a, b) => a - b).join('-');

    let jId = junctionByParents.get(key);
    if (!jId) {
      const px = parents.reduce((sum, pid) => sum + nodePos.get(pid)!.x, 0) / parents.length + CARD_W / 2 - 3;
      const py = Math.max(...parents.map(pid => nodePos.get(pid)!.y)) + CARD_H + (V_GAP - CARD_H) / 2 - 3;
      jId = `junc-${junctionCount++}`;
      nodes.push({ id: jId, type: 'junction', position: { x: px, y: py }, data: {} });
      for (const pid of parents) {
        edges.push({ id: `e-${pid}-${jId}`, source: `p-${pid}`, target: jId, type: 'default', style: familyEdgeStyle });
      }
      junctionByParents.set(key, jId);
    }
    edges.push({ id: `e-${jId}-${id}`, source: jId, target: `p-${id}`, type: 'default', style: familyEdgeStyle });
  }

  return { nodes, edges, truncated, shown: levelOf.size };
}

// ─── Family Tree View ───
export function FamilyTreeView({
  resident,
  allResidents,
  onRecenter,
  onPersonClick,
  height,
  compact = false,
}: {
  resident: Resident | TreeResident;
  allResidents: TreeResident[];
  onRecenter: (id: number) => void;
  onPersonClick?: (id: number) => void;
  height?: string;
  compact?: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [depth, setDepth] = useState(3);
  const [autoDepth, setAutoDepth] = useState(3);
  const [truncatedInfo, setTruncatedInfo] = useState<{ truncated: boolean; shown: number }>({ truncated: false, shown: 0 });

  const tree: TreeData = useMemo(() => buildTreeData(allResidents), [allResidents]);

  const centerTreeResident = useMemo(() => {
    const r = resident as any;
    return tree.residentMap.get(r.id) || {
      id: r.id, first_name: r.first_name, middle_name: r.middle_name,
      last_name: r.last_name, suffix: r.suffix, gender: r.gender,
      partner_id: r.partner_id, mother_id: r.mother_id, father_id: r.father_id,
      purok: r.purok, age: r.age || 0,
    };
  }, [resident, tree]);

  // Auto-fit depth to the actual family data when the person changes
  useEffect(() => {
    const depths = dataDepths(centerTreeResident, tree);
    const calculated = Math.max(1, Math.max(depths.up, depths.down));
    setAutoDepth(calculated);
    setDepth(calculated);
  }, [centerTreeResident, tree]);

  useEffect(() => {
    const result = buildFamilyNetwork(centerTreeResident, tree, depth);
    setNodes(result.nodes);
    setEdges(result.edges);
    setTruncatedInfo({ truncated: result.truncated, shown: result.shown });
  }, [centerTreeResident, tree, depth, setNodes, setEdges]);

  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type !== 'person') return;
    const personId = node.data?.personId;
    if (personId && personId !== (resident as any).id) {
      onRecenter(personId);
    }
  }, [resident, onRecenter]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type !== 'person' || !onPersonClick) return;
    const personId = node.data?.personId;
    if (personId) onPersonClick(personId);
  }, [onPersonClick]);

  const sliderMax = Math.min(MAX_GENERATIONS, Math.max(autoDepth, 6));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3">
        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Generations</Label>
        <Slider value={[depth]} onValueChange={([v]) => setDepth(v)} min={1} max={sliderMax} step={1} className="w-48" />
        <span className="text-xs font-medium tabular-nums min-w-[80px]">{depth} generation{depth > 1 ? 's' : ''}</span>
        {depth !== autoDepth && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
            onClick={() => setDepth(autoDepth)}
          >
            Reset to auto ({autoDepth})
          </button>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">{truncatedInfo.shown} people shown</span>
      </div>

      {truncatedInfo.truncated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          This family network is very large — showing the {MAX_NODES} closest relatives to keep things fast.
          Lower the generations slider, or double-click a person on the edge to explore their side of the family.
        </div>
      )}

      {!compact && (
        <div className="rounded-lg border bg-card text-[10px] text-muted-foreground px-3 py-1.5 flex items-center gap-2">
          <span>💡</span>
          <span>The tree shows every connection — siblings, spouses, cousins, in-laws. Click a person for details · double-click to re-center on them</span>
        </div>
      )}

      <div className="w-full rounded-lg border bg-card" style={{ height: height || 'calc(100vh - 340px)', minHeight: compact ? '320px' : '500px' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          fitView fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'default' }}
          minZoom={0.02} maxZoom={2}
          onlyRenderVisibleElements
        >
          <Controls />
          <Background gap={24} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
