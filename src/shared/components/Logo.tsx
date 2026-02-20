import { cn } from '../utils/cn'

type LogoProps = {
  className?: string
  subtitle?: string
}

function Logo({ className, subtitle }: LogoProps) {
  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)}>
      <span className="text-sm font-semibold">Martinique</span>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  )
}

export { Logo }
