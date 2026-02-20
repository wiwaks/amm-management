import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const toastVariants = cva(
  'pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 shadow-lg',
  {
    variants: {
      variant: {
        info: 'border bg-card text-foreground',
        success: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700',
        error: 'border-destructive/40 bg-destructive/10 text-destructive',
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
        ? 'text-destructive/80'
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
            className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            Fermer
          </button>
        ) : null}
      </div>
    </div>
  )
}

export { Toast }
