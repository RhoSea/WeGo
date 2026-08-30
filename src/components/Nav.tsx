import type { ComponentType } from 'react'
import { IconBudget, IconMembers, IconPlan, IconSavings } from './art'

export interface TabDef {
  path: string
  label: string
  Icon: ComponentType<{ size?: number; className?: string }>
}

export const TABS: readonly TabDef[] = [
  { path: '/plan', label: 'Plan', Icon: IconPlan },
  { path: '/budget', label: 'Budget', Icon: IconBudget },
  { path: '/savings', label: 'Savings', Icon: IconSavings },
  { path: '/members', label: 'Members', Icon: IconMembers },
] as const

/**
 * The same four destinations twice: ticket tabs in the masthead on a wide
 * screen, a row of stamps along the bottom edge on a phone.
 */
export function Nav({
  current,
  onNavigate,
  variant,
}: {
  current: string
  onNavigate: (path: string) => void
  variant: 'desktop' | 'mobile'
}) {
  return (
    <nav
      className={variant === 'desktop' ? 'nav-desk' : 'nav-mobile'}
      aria-label={variant === 'desktop' ? 'Trip sections' : 'Trip sections, bottom navigation'}
    >
      {TABS.map(({ path, label, Icon }) => (
        <button
          key={path}
          className="tab"
          aria-current={current === path ? 'page' : undefined}
          onClick={() => onNavigate(path)}
        >
          {variant === 'mobile' ? (
            <>
              <span className="ink"><Icon size={19} /></span>
              {label}
            </>
          ) : (
            <>
              <Icon size={17} />
              {label}
            </>
          )}
        </button>
      ))}
    </nav>
  )
}
