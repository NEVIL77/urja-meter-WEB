// The network drawn like a single-line diagram: each level hangs off a busbar,
// and the path to the selected node is traced in amber.
import { useEffect, useState } from 'react';
import type { Status, TreeNode } from '../api';
import { LEVEL_LABEL } from '../format';
import { ShareBar } from './StatusMark';

export type Counts = Record<Status, number> & { total: number };
export const NO_METERS: Counts = { total: 0, installed: 0, faulty: 0, decommissioned: 0 };

interface Props {
  tree: TreeNode[];
  /** Meter counts per node path, after the filters. */
  counts: Map<string, Counts>;
  capacityKva: Map<string, number | null>;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}

const isOnPath = (node: string, selected: string | null) =>
  selected !== null && (selected === node || selected.startsWith(`${node}/`));

export function NetworkTree({ tree, counts, capacityKva, selectedPath, onSelect }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree.map((z) => z.path)));

  // Picking a node elsewhere (a breadcrumb, say) opens the branches above it.
  useEffect(() => {
    if (!selectedPath) return;
    const parts = selectedPath.split('/');
    setOpen((prev) => new Set([...prev, ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))]));
  }, [selectedPath]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const branch = (nodes: TreeNode[], live: boolean) => (
    <ul className={live ? 'live' : undefined}>
      {nodes.map((node) => {
        const c = counts.get(node.path) ?? NO_METERS;
        const expanded = open.has(node.path);
        const hasChildren = node.children.length > 0;
        const onPath = isOnPath(node.path, selectedPath);
        const kva = node.level === 'transformer' ? capacityKva.get(node.code) : undefined;
        return (
          <li key={node.path}>
            <button
              className={['node', onPath && 'live', selectedPath === node.path && 'selected', c.total === 0 && 'dim']
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelect(selectedPath === node.path ? null : node.path);
                if (hasChildren && !expanded) toggle(node.path);
              }}
              aria-expanded={hasChildren ? expanded : undefined}
              aria-current={selectedPath === node.path ? 'true' : undefined}
              title={`${LEVEL_LABEL[node.level]} ${node.code}: ${c.total} meters`}
            >
              <span
                className={`caret${expanded ? ' open' : ''}`}
                onClick={(e) => {
                  if (!hasChildren) return;
                  e.stopPropagation();
                  toggle(node.path);
                }}
                aria-hidden="true"
              >
                {hasChildren ? '▶' : ''}
              </span>
              <span className="code">{node.code}</span>
              <span className="name">
                {node.name}
                {kva != null && <span className="kva"> · {kva} kVA</span>}
              </span>
              <ShareBar counts={c} className="mini-bar" />
              <span className="total">{c.total}</span>
            </button>
            {hasChildren && expanded && branch(node.children, isOnPath(node.path, selectedPath) && selectedPath !== node.path)}
          </li>
        );
      })}
    </ul>
  );

  return <nav className="tree" aria-label="Network hierarchy">{branch(tree, false)}</nav>;
}
