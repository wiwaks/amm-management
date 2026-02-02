import { cn } from '../utils/cn'

type LogoProps = {
  className?: string
  subtitle?: string
}

function Logo({ className, subtitle }: LogoProps) {
  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <span className="font-display text-sm uppercase tracking-[0.45em] text-primary">
        Martinique
      </span>
      {subtitle ? (
        <span className="text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
    </div>
  )
}

export { Logo }
