import { cn } from '../utils/cn'

type LogoProps = {
  className?: string
  subtitle?: string
  size?: 'sm' | 'lg'
}

function Logo({ className, subtitle, size = 'sm' }: LogoProps) {
  const isLg = size === 'lg'

  return (
    <div className={cn('inline-flex flex-col items-center gap-0', className)}>
      <span
        className={cn(
          'font-light tracking-wide text-foreground',
          isLg ? 'text-2xl' : 'text-sm',
        )}
      >
        Agence Matrimoniale
      </span>
      <span
        className={cn(
          'border-b-2 border-terracotta pb-0.5 font-medium uppercase tracking-[0.25em] text-terracotta',
          isLg ? 'text-sm' : 'text-[10px]',
        )}
      >
        Martinique
      </span>
      {subtitle ? (
        <span
          className={cn(
            'mt-1 text-muted-foreground',
            isLg ? 'text-sm' : 'text-[10px]',
          )}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  )
}

export { Logo }
