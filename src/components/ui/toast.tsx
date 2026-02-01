import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const toastVariants = cva(
  'pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 shadow-lg backdrop-blur',
  {
    variants: {
      variant: {
        info: 'border-border/60 bg-card/90 text-foreground',
        success: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700',
        error: 'border-rose-500/40 bg-rose-500/15 text-rose-700',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
)

export interface ToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  title: string
  description?: string
  onClose?: () => void
}

function Toast({
  title,
  description,
  variant,
  className,
  onClose,
  ...props
}: ToastProps) {
  const descriptionClass =
    variant === 'success'
      ? 'text-emerald-700/80'
      : variant === 'error'
        ? 'text-rose-700/80'
        : 'text-muted-foreground'

  return (
    <div className={cn(toastVariants({ variant }), className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? (
            <p className={cn('text-xs', descriptionClass)}>{description}</p>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border/60 px-2 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
          >
            Fermer
          </button>
        ) : null}
      </div>
    </div>
  )
}

export { Toast }
