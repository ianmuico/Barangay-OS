'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  ReactFlowProvider,
  Position,
  Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { getAPI, type Resident, type TreeResident } from '@/lib/ipc';
import { getGradientForId, getInitials } from '@/lib/constants';

// ─── Constants ───
const CARD_W = 160;
const CARD_H = 140;
const H_GAP = 60;
const V_GAP = 180;
const PAIR_GAP = 24;

// ─── Gender helper ───
function fullGender(g: string): string {
  if (!g) return 'Unknown';
  const lower = g.toLowerCase();
  if (lower === 'm' || lower === 'male') return 'Male';
  if (lower === 'f' || lower === 'female') return 'Female';
  return g;
}

// ─── Build display name ───
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
  'Grandchild': 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
  'Great-Grandchild': 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
  "Child's Partner": 'bg-pink-100/60 text-pink-500 dark:bg-pink-900/20 dark:text-pink-400',
  'Spouse': 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300',
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
}

function getChildren(tree: TreeData, parentId: number): TreeResident[] {
  return tree.allResidents.filter(r => r.mother_id === parentId || r.father_id === parentId);
}

function getSiblings(tree: TreeData, person: TreeResident): TreeResident[] {
  return tree.allResidents.filter(
    r => r.id !== person.id &&
    ((person.mother_id && r.mother_id === person.mother_id) ||
     (person.father_id && r.father_id === person.father_id))
  );
}

// ─── Calculate max possible depth for a person ───
function calculateMaxDepth(person: TreeResident, tree: TreeData): number {
  // Count ancestor levels
  function countAncestors(p: TreeResident, visited: Set<number>): number {
    if (visited.has(p.id)) return 0;
    visited.add(p.id);
    let maxUp = 0;
    if (p.mother_id) {
      const mother = tree.residentMap.get(p.mother_id);
      if (mother) maxUp = Math.max(maxUp, 1 + countAncestors(mother, visited));
    }
    if (p.father_id) {
      const father = tree.residentMap.get(p.father_id);
      if (father) maxUp = Math.max(maxUp, 1 + countAncestors(father, visited));
    }
    return maxUp;
  }

  // Count descendant levels
  function countDescendants(personId: number, visited: Set<number>): number {
    if (visited.has(personId)) return 0;
    visited.add(personId);
    const p = tree.residentMap.get(personId);
    const kids = getChildren(tree, personId);
    // Also check partner's children
    if (p?.partner_id) {
      const partnerKids = getChildren(tree, p.partner_id).filter(k => !kids.find(c => c.id === k.id));
      kids.push(...partnerKids);
    }
    if (kids.length === 0) return 0;
    let maxDown = 0;
    for (const kid of kids) {
      if (!visited.has(kid.id)) {
        maxDown = Math.max(maxDown, 1 + countDescendants(kid.id, new Set(visited)));
      }
    }
    return maxDown;
  }

  const ancestorLevels = countAncestors(person, new Set());
  const descendantLevels = countDescendants(person.id, new Set());

  // Map to our depth system: 1=self, 2=parents+siblings, 3=grandparents, 4+=children/grandchildren
  // Minimum 1, and we count: ancestors contribute ~2 per generation, descendants contribute ~1 per gen
  let depth = 1; // self
  if (person.partner_id) depth = Math.max(depth, 1);
  if (ancestorLevels >= 1) depth = Math.max(depth, 2); // parents
  if (ancestorLevels >= 2) depth = Math.max(depth, 3); // grandparents
  if (descendantLevels >= 1) depth = Math.max(depth, 4); // children + grandchildren start
  if (descendantLevels >= 2) depth = Math.max(depth, 5); // great-grandchildren
  if (descendantLevels >= 3) depth = Math.max(depth, 6);

  // Check siblings
  const siblings = getSiblings(tree, person);
  if (siblings.length > 0 && depth < 2) depth = 2;

  return Math.max(1, Math.min(depth, 10));
}

// ─── Tree builder ───
function buildFamilyTree(centerPerson: TreeResident, tree: TreeData, maxDepth: number) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<number>();
  let junctionCount = 0;

  function addPersonNode(id: string, person: TreeResident, role: string, x: number, y: number) {
    if (nodes.find(n => n.id === id)) return;
    nodes.push({
      id, type: 'person', position: { x, y },
      data: { label: buildName(person), role, gender: person.gender, age: person.age || 0, personId: person.id },
    });
  }

  function addJunction(x: number, y: number): string {
    const jId = `junc-${junctionCount++}`;
    nodes.push({ id: jId, type: 'junction', position: { x: x + CARD_W / 2 - 3, y }, data: {} });
    return jId;
  }

  function addEdge(source: string, target: string, isPartner = false, sourceHandle?: string, targetHandle?: string) {
    const id = `e-${source}-${target}`;
    if (edges.find(e => e.id === id)) return;
    edges.push({
      id, source, target, sourceHandle, targetHandle,
      type: isPartner ? 'straight' : 'default',
      style: isPartner ? partnerEdgeStyle : familyEdgeStyle,
    });
  }

  // Calculate how many ancestor levels we have to position self correctly
  let ancestorRows = 0;
  if (maxDepth >= 2 && (centerPerson.mother_id || centerPerson.father_id)) ancestorRows = 1;
  if (maxDepth >= 3) {
    const mother = centerPerson.mother_id ? tree.residentMap.get(centerPerson.mother_id) : null;
    const father = centerPerson.father_id ? tree.residentMap.get(centerPerson.father_id) : null;
    if ((mother && (mother.mother_id || mother.father_id)) || (father && (father.mother_id || father.father_id))) {
      ancestorRows = 2;
    }
  }

  const SELF_Y = ancestorRows * V_GAP;
  const centerX = 600;

  // ===== SELECTED PERSON =====
  const selfId = `p-${centerPerson.id}`;
  visited.add(centerPerson.id);
  addPersonNode(selfId, centerPerson, 'You', centerX, SELF_Y);

  // ===== PARTNER =====
  if (centerPerson.partner_id) {
    const partner = tree.residentMap.get(centerPerson.partner_id);
    if (partner) {
      visited.add(partner.id);
      const partnerId = `p-${partner.id}`;
      addPersonNode(partnerId, partner, 'Partner', centerX + CARD_W + PAIR_GAP, SELF_Y);
      addEdge(selfId, partnerId, true, 'right', 'left');
    }
  }

  // ===== PARENTS =====
  const parentY = SELF_Y - V_GAP;
  let motherNodeId: string | null = null;
  let fatherNodeId: string | null = null;

  if (maxDepth >= 2) {
    if (centerPerson.mother_id) {
      const mother = tree.residentMap.get(centerPerson.mother_id);
      if (mother) {
        visited.add(mother.id);
        motherNodeId = `p-${mother.id}`;
        addPersonNode(motherNodeId, mother, 'Mother', centerX - CARD_W / 2 - PAIR_GAP / 2, parentY);
      }
    }
    if (centerPerson.father_id) {
      const father = tree.residentMap.get(centerPerson.father_id);
      if (father) {
        visited.add(father.id);
        fatherNodeId = `p-${father.id}`;
        addPersonNode(fatherNodeId, father, 'Father', centerX + CARD_W / 2 + PAIR_GAP / 2, parentY);
      }
    }
    if (motherNodeId && fatherNodeId) {
      addEdge(motherNodeId, fatherNodeId, true, 'right', 'left');
    }

    // Junction from parents to self + siblings
    const siblings = getSiblings(tree, centerPerson);
    const uniqueSiblings = Array.from(new Map(siblings.map(s => [s.id, s])).values());

    if (motherNodeId || fatherNodeId) {
      const juncY = parentY + CARD_H + (V_GAP - CARD_H) / 2 - 3;
      const jId = addJunction(centerX, juncY);
      if (motherNodeId) addEdge(motherNodeId, jId);
      if (fatherNodeId) addEdge(fatherNodeId, jId);
      addEdge(jId, selfId);

      uniqueSiblings.forEach((sib, idx) => {
        visited.add(sib.id);
        const sibId = `p-${sib.id}`;
        const sibX = centerX - (CARD_W + H_GAP) * (idx + 1);
        addPersonNode(sibId, sib, 'Sibling', sibX, SELF_Y);
        addEdge(jId, sibId);

        // Show sibling's partner
        if (sib.partner_id && !visited.has(sib.partner_id)) {
          const sibPartner = tree.residentMap.get(sib.partner_id);
          if (sibPartner) {
            visited.add(sibPartner.id);
            const spId = `p-${sibPartner.id}`;
            addPersonNode(spId, sibPartner, 'Spouse', sibX - CARD_W - PAIR_GAP, SELF_Y);
            addEdge(spId, sibId, true, 'right', 'left');
          }
        }
      });
    }
  }

  // ===== GRANDPARENTS (depth 3+) =====
  if (maxDepth >= 3) {
    const grandparentY = parentY - V_GAP;

    const addGrandparents = (parent: TreeResident | undefined, parentNodeId: string | null, baseX: number) => {
      if (!parent || !parentNodeId) return;
      let gmId: string | null = null;
      let gfId: string | null = null;

      if (parent.mother_id) {
        const gm = tree.residentMap.get(parent.mother_id);
        if (gm && !visited.has(gm.id)) {
          visited.add(gm.id);
          gmId = `p-${gm.id}`;
          addPersonNode(gmId, gm, 'Grandparent', baseX - CARD_W / 2 - PAIR_GAP / 2, grandparentY);
        }
      }
      if (parent.father_id) {
        const gf = tree.residentMap.get(parent.father_id);
        if (gf && !visited.has(gf.id)) {
          visited.add(gf.id);
          gfId = `p-${gf.id}`;
          addPersonNode(gfId, gf, 'Grandparent', baseX + CARD_W / 2 + PAIR_GAP / 2, grandparentY);
        }
      }
      if (gmId && gfId) addEdge(gmId, gfId, true, 'right', 'left');
      if (gmId || gfId) {
        const gjY = grandparentY + CARD_H + (V_GAP - CARD_H) / 2 - 3;
        const gjId = addJunction(baseX, gjY);
        if (gmId) addEdge(gmId, gjId);
        if (gfId) addEdge(gfId, gjId);
        addEdge(gjId, parentNodeId);
      }
    };

    if (centerPerson.mother_id) {
      addGrandparents(tree.residentMap.get(centerPerson.mother_id), motherNodeId, centerX - CARD_W / 2 - PAIR_GAP / 2);
    }
    if (centerPerson.father_id) {
      addGrandparents(tree.residentMap.get(centerPerson.father_id), fatherNodeId, centerX + CARD_W / 2 + PAIR_GAP / 2);
    }
  }

  // ===== CHILDREN + DESCENDANTS (recursive) =====
  const partner = centerPerson.partner_id ? tree.residentMap.get(centerPerson.partner_id) : null;

  function addDescendants(
    parentIds: number[],
    parentNodeIds: string[],
    parentX: number,
    parentY: number,
    currentGenDepth: number,
    roleLabel: string,
  ) {
    if (currentGenDepth > maxDepth) return;

    // Collect children from all parentIds
    const childrenRaw: TreeResident[] = [];
    for (const pid of parentIds) {
      for (const r of tree.allResidents) {
        if (!visited.has(r.id) && (r.mother_id === pid || r.father_id === pid)) {
          if (!childrenRaw.find(c => c.id === r.id)) childrenRaw.push(r);
        }
      }
    }

    if (childrenRaw.length === 0) return;

    const childY = parentY + V_GAP;
    const cjY = parentY + CARD_H + (V_GAP - CARD_H) / 2 - 3;
    const cjId = addJunction(parentX, cjY);

    for (const pnId of parentNodeIds) {
      addEdge(pnId, cjId);
    }

    // Calculate width: each child unit = CARD_W (+ partner width if they have one)
    const childUnits = childrenRaw.map(child => {
      const hasPartner = child.partner_id && !visited.has(child.partner_id) && tree.residentMap.has(child.partner_id);
      return hasPartner ? (CARD_W * 2 + PAIR_GAP) : CARD_W;
    });
    const totalChildrenW = childUnits.reduce((sum, w) => sum + w, 0) + (childrenRaw.length - 1) * H_GAP;
    let currentX = parentX + CARD_W / 2 - totalChildrenW / 2;

    childrenRaw.forEach((child, idx) => {
      visited.add(child.id);
      const cId = `p-${child.id}`;
      const cx = currentX;
      addPersonNode(cId, child, roleLabel, cx, childY);
      addEdge(cjId, cId);

      const nextParentIds = [child.id];
      const nextParentNodeIds = [cId];

      // Show child's partner
      if (child.partner_id && !visited.has(child.partner_id)) {
        const childPartner = tree.residentMap.get(child.partner_id);
        if (childPartner) {
          visited.add(childPartner.id);
          const cpId = `p-${childPartner.id}`;
          addPersonNode(cpId, childPartner, roleLabel === 'Child' ? "Child's Partner" : 'Spouse', cx + CARD_W + PAIR_GAP, childY);
          addEdge(cId, cpId, true, 'right', 'left');
          nextParentIds.push(childPartner.id);
          nextParentNodeIds.push(cpId);
          currentX += CARD_W * 2 + PAIR_GAP + H_GAP;
        } else {
          currentX += CARD_W + H_GAP;
        }
      } else {
        currentX += childUnits[idx] + H_GAP;
      }

      // Recurse for next generation
      const nextRole = roleLabel === 'Child' ? 'Grandchild' : roleLabel === 'Grandchild' ? 'Great-Grandchild' : 'Great-Grandchild';
      const midX = nextParentNodeIds.length > 1
        ? cx + (CARD_W + PAIR_GAP) / 2
        : cx;
      addDescendants(nextParentIds, nextParentNodeIds, midX, childY, currentGenDepth + 1, nextRole);
    });
  }

  if (maxDepth >= 4) {
    const selfParentIds = [centerPerson.id];
    const selfParentNodeIds = [selfId];
    if (partner) {
      selfParentIds.push(partner.id);
      selfParentNodeIds.push(`p-${partner.id}`);
    }
    const pairMidX = partner ? centerX + (CARD_W + PAIR_GAP) / 2 : centerX;
    addDescendants(selfParentIds, selfParentNodeIds, pairMidX, SELF_Y, 4, 'Child');
  }

  return { nodes, edges };
}

// ─── Family Tree View ───
function FamilyTreeView({
  resident,
  allResidents,
  onRecenter,
}: {
  resident: Resident;
  allResidents: TreeResident[];
  onRecenter: (id: number) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [depth, setDepth] = useState(3);
  const [autoDepth, setAutoDepth] = useState(3);

  const tree: TreeData = useMemo(() => {
    const map = new Map<number, TreeResident>();
    allResidents.forEach(r => map.set(r.id, r));
    return { allResidents, residentMap: map };
  }, [allResidents]);

  const centerTreeResident = useMemo(() => {
    return tree.residentMap.get(resident.id) || {
      id: resident.id, first_name: resident.first_name, middle_name: resident.middle_name,
      last_name: resident.last_name, suffix: resident.suffix, gender: resident.gender,
      partner_id: resident.partner_id, mother_id: resident.mother_id, father_id: resident.father_id,
      purok: resident.purok, age: resident.age || 0,
    };
  }, [resident, tree]);

  // Auto-calculate optimal depth when person changes
  useEffect(() => {
    const calculatedDepth = calculateMaxDepth(centerTreeResident, tree);
    setAutoDepth(calculatedDepth);
    setDepth(calculatedDepth);
  }, [centerTreeResident, tree]);

  useEffect(() => {
    const result = buildFamilyTree(centerTreeResident, tree, depth);
    setNodes(result.nodes);
    setEdges(result.edges);
  }, [centerTreeResident, tree, depth, setNodes, setEdges]);

  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type !== 'person') return;
    const personId = node.data?.personId;
    if (personId && personId !== resident.id) {
      onRecenter(personId);
    }
  }, [resident.id, onRecenter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-lg border bg-card p-3">
        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Tree Depth</Label>
        <Slider value={[depth]} onValueChange={([v]) => setDepth(v)} min={1} max={Math.max(autoDepth, 6)} step={1} className="w-48" />
        <span className="text-xs font-medium tabular-nums min-w-[60px]">{depth} level{depth > 1 ? 's' : ''}</span>
        {depth !== autoDepth && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
            onClick={() => setDepth(autoDepth)}
          >
            Reset to auto ({autoDepth})
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card text-[10px] text-muted-foreground px-3 py-1.5 flex items-center gap-2">
        <span>💡</span>
        <span>Double-click any person to re-center the tree on them</span>
      </div>

      <div className="w-full rounded-lg border bg-card" style={{ height: 'calc(100vh - 340px)', minHeight: '500px' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeDoubleClick={handleNodeDoubleClick}
          fitView fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'default' }}
          minZoom={0.05} maxZoom={2}
        >
          <Controls />
          <Background gap={24} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function FamilyTreePage() {
  const [sq, setSq] = useState('');
  const [sr, setSr] = useState<Resident[]>([]);
  const [sel, setSel] = useState<Resident | null>(null);
  const [allResidents, setAllResidents] = useState<TreeResident[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getResidentsForTree().then(data => { setAllResidents(data); setLoaded(true); });
  }, []);

  useEffect(() => {
    if (!sq.trim() || sq.length < 2) { setSr([]); return; }
    const t = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      setSr(await api.searchResidents(sq, 15));
    }, 300);
    return () => clearTimeout(t);
  }, [sq]);

  const pick = useCallback(async (r: Resident | { id: number }) => {
    const api = getAPI();
    if (!api) return;
    const full = await api.getResident(r.id);
    if (full) setSel(full);
    const freshTree = await api.getResidentsForTree();
    setAllResidents(freshTree);
    setSq(''); setSr([]);
  }, []);

  const handleRecenter = useCallback((id: number) => {
    pick({ id });
  }, [pick]);

  return (
    <div className="space-y-4">
      <PageHeader title="Family Tree" description="Search for a resident to view their family connections." />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search resident by name..." value={sq} onChange={e => setSq(e.target.value)} className="pl-9" />
        {sr.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
            {sr.map(r => {
              const [c1, c2] = getGradientForId(r.id);
              const initials = getInitials(`${r.first_name} ${r.last_name}`);
              return (
                <button key={r.id} className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors" onClick={() => pick(r)}>
                  <div className="flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ width: 32, height: 32, borderRadius: '22%', background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials}</div>
                  <div className="text-left min-w-0">
                    <p className="font-medium truncate">{r.first_name} {r.last_name}</p>
                    <p className="text-xs text-muted-foreground">{fullGender(r.gender)} · Age {r.age}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {sel && loaded ? (
        <ReactFlowProvider>
          <FamilyTreeView resident={sel} allResidents={allResidents} onRecenter={handleRecenter} />
        </ReactFlowProvider>
      ) : (
        <Card><CardContent className="flex flex-col items-center justify-center py-24 gap-2">
          <GitBranchIcon className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Search for a resident above to view their family tree.</p>
        </CardContent></Card>
      )}
    </div>
  );
}

function GitBranchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}
