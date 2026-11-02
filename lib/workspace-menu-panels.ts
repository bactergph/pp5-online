import type { ReactNode } from 'react'

type MenuItem = { label: string; href?: string; icon?: ReactNode; children?: readonly MenuItem[] }
type MenuSection = { label?: string; icon?: ReactNode; items: readonly MenuItem[] }
export type WorkspaceMenuNode = {
  key: string
  label: string
  href?: string
  icon?: ReactNode
  children?: WorkspaceMenuNode[]
  heading?: boolean
}

/** Presentation only: consume the existing role/education-filtered menu. */
export function workspaceMenuPanels(sections: readonly MenuSection[]): WorkspaceMenuNode[] {
  function item(node: MenuItem, key: string): WorkspaceMenuNode {
    return { key, label: node.label, href: node.href, icon: node.icon,
      ...(node.children?.length ? { children: node.children.map((child, i) => item(child, `${key}/${i}`)), heading: !node.href } : {}) }
  }
  return sections.flatMap((section, i) => {
    const key = `section-${i}`
    if (!section.label) return section.items.map((node, j) => item(node, `${key}/${j}`))
    const only = section.items.length === 1 ? section.items[0] : undefined
    // Do not add an extra screen for a single item or an already-grouped module.
    if (only && !only.children?.length) return [item(only, key)]
    return [{ key, label: section.label, icon: section.icon || section.items[0]?.icon,
      href: only?.href,
      children: (only?.children?.length ? only.children : section.items).map((node, j) => item(node, `${key}/${j}`)) }]
  })
}

/** Deep links and browser history open the most specific matching panel. */
export function workspacePanelTrail(nodes: readonly WorkspaceMenuNode[], pathname: string): string[] {
  let best: { score: number; trail: string[] } = { score: -1, trail: [] }
  function visit(entries: readonly WorkspaceMenuNode[], trail: string[]) {
    for (const node of entries) {
      const next = node.children && !node.heading ? [...trail, node.key] : trail
      if (node.href && (pathname === node.href || pathname.startsWith(node.href + '/'))) {
        const score = node.href.length * 2 + (pathname === node.href ? 1 : 0)
        if (score > best.score) best = { score, trail: next }
      }
      if (node.children) visit(node.children, next)
    }
  }
  visit(nodes, [])
  return best.trail
}

/** Parent pages such as /schedules/class must not also highlight on /class/manage. */
export function workspaceCurrentMenuHref(nodes: readonly WorkspaceMenuNode[], pathname: string): string | undefined {
  let current: string | undefined
  function visit(entries: readonly WorkspaceMenuNode[]) {
    for (const node of entries) {
      if (node.children) visit(node.children)
      else if (node.href && (pathname === node.href || pathname.startsWith(node.href + '/')) && node.href.length > (current?.length || 0)) current = node.href
    }
  }
  visit(nodes)
  return current
}
