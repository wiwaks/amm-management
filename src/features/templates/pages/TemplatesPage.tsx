import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import CodeMirror from '@uiw/react-codemirror'
import { html } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { Save } from 'lucide-react'
import { Button } from '../../../shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import { Badge } from '../../../shared/components/ui/badge'
import { Toast } from '../../../shared/components/ui/toast'
import {
  fetchDefaultTemplate,
  upsertDefaultTemplate,
} from '../../../services/supabase/loverCvTemplates'
import {
  fetchFormQuestionMap,
  type FormQuestionMap,
} from '../../../services/supabase/formQuestionMap'
import { mergeTemplate } from '../../../shared/utils/loverCvMerge'

type ToastMessage = {
  title: string
  description?: string
  variant?: 'info' | 'success' | 'error'
}

function TemplatesPage() {
  const [htmlContent, setHtmlContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [questionMap, setQuestionMap] = useState<FormQuestionMap[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const hasUnsavedChanges = htmlContent !== savedContent

  useEffect(() => {
    let mounted = true
    Promise.all([fetchDefaultTemplate(), fetchFormQuestionMap()])
      .then(([template, questions]) => {
        if (!mounted) return
        if (template) {
          setHtmlContent(template.html_content)
          setSavedContent(template.html_content)
        }
        setQuestionMap(questions)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setToast({
          title: 'Erreur de chargement',
          description: err instanceof Error ? err.message : String(err),
          variant: 'error',
        })
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const saveMutation = useMutation({
    mutationFn: () => upsertDefaultTemplate(htmlContent),
    onSuccess: () => {
      setSavedContent(htmlContent)
      setToast({
        title: 'Template sauvegardé',
        description: 'Le template a été enregistré.',
        variant: 'success',
      })
    },
    onError: (error) => {
      setToast({
        title: 'Erreur de sauvegarde',
        description: error.message,
        variant: 'error',
      })
    },
  })

  const updatePreview = useCallback(() => {
    if (!iframeRef.current) return
    const sampleVars: Record<string, string> = {}
    for (const q of questionMap) {
      sampleVars[q.label] = `[${q.label}]`
    }
    const merged = mergeTemplate(htmlContent, sampleVars)
    const doc = iframeRef.current.contentDocument
    if (doc) {
      doc.open()
      doc.write(merged)
      doc.close()
    }
  }, [htmlContent, questionMap])

  useEffect(() => {
    const timer = setTimeout(updatePreview, 300)
    return () => clearTimeout(timer)
  }, [updatePreview])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement du template...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Template Lover CV</CardTitle>
                <CardDescription>
                  Editez le template HTML. Utilisez {'{{NomDuChamp}}'} pour les
                  placeholders.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 text-amber-600"
                  >
                    Non sauvegardé
                  </Badge>
                )}
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !hasUnsavedChanges}
                  className="gap-2"
                >
                  <Save className="size-4" />
                  {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            {questionMap.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="mr-1 text-xs font-medium text-muted-foreground">
                  Placeholders :
                </span>
                {questionMap.map((q) => (
                  <Badge
                    key={q.question_id}
                    variant="secondary"
                    className="cursor-pointer font-mono text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${q.label}}}`)
                      setToast({
                        title: 'Copié',
                        description: `{{${q.label}}} copié dans le presse-papier.`,
                        variant: 'info',
                      })
                    }}
                  >
                    {`{{${q.label}}}`}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid max-h-[70vh] min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="min-h-0 overflow-hidden rounded-lg border">
                <CodeMirror
                  value={htmlContent}
                  onChange={setHtmlContent}
                  extensions={[html()]}
                  theme={oneDark}
                  height="100%"
                  className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
                />
              </div>

              <div className="min-h-0 overflow-auto rounded-lg border bg-white">
                <iframe
                  ref={iframeRef}
                  title="Aperçu Lover CV"
                  className="min-h-full w-full"
                  style={{ height: '900px' }}
                  sandbox="allow-same-origin allow-scripts"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {toast
        ? createPortal(
            <div className="fixed right-6 top-16 z-50 flex w-full max-w-sm flex-col gap-3">
              <Toast
                title={toast.title}
                description={toast.description}
                variant={toast.variant}
                onClose={() => setToast(null)}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export default TemplatesPage
