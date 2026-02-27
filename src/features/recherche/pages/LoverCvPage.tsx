import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, FileText, ExternalLink, Download, Trash2, Clock } from 'lucide-react'
import { toJpeg } from 'html-to-image'
import { cn } from '../../../shared/utils/cn'
import { Button } from '../../../shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import { ScrollArea } from '../../../shared/components/ui/scroll-area'
import { Separator } from '../../../shared/components/ui/separator'
import { Skeleton } from '../../../shared/components/ui/skeleton'
import {
  fetchSubmissionAnswers,
  type FormSubmissionAnswer,
} from '../../../services/supabase/formSubmissionAnswers'
import {
  fetchFormQuestionMap,
  type FormQuestionMap,
} from '../../../services/supabase/formQuestionMap'
import { fetchDefaultTemplate } from '../../../services/supabase/loverCvTemplates'
import { generateLoverCv } from '../../../services/supabase/generateLoverCv'
import { buildVariablesMap } from '../../../shared/utils/loverCvMerge'
import {
  insertGeneration,
  fetchGenerationsBySubmission,
  deleteGeneration,
  type LoverCvGeneration,
} from '../../../services/supabase/loverCvGenerations'
import { getSession } from '../../../shared/auth/sessionManager'

type LocationState = {
  prenom?: string
  nom?: string
  age?: string
  email?: string | null
  phone?: string | null
} | null

function formatDate(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function LoverCvPage() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = (location.state ?? null) as LocationState

  const [answers, setAnswers] = useState<FormSubmissionAnswer[]>([])
  const [questionMap, setQuestionMap] = useState<FormQuestionMap[]>([])
  const [generations, setGenerations] = useState<LoverCvGeneration[]>([])
  const [selectedGeneration, setSelectedGeneration] = useState<LoverCvGeneration | null>(null)
  const [loading, setLoading] = useState(true)
  const [customPrompt, setCustomPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidateInfo = useMemo(() => {
    if (locationState?.prenom || locationState?.nom) {
      return {
        name: [locationState.prenom, locationState.nom].filter(Boolean).join(' '),
        age: locationState.age ?? '',
        email: locationState.email ?? null,
        phone: locationState.phone ?? null,
      }
    }
    if (answers.length > 0 && questionMap.length > 0) {
      const vars = buildVariablesMap(answers, questionMap)
      return {
        name: [vars['Prénom'], vars['Nom']].filter(Boolean).join(' ') || 'Candidat',
        age: vars['Âge'] ?? vars['Age'] ?? '',
        email: vars['Email'] ?? null,
        phone: vars['Telephone'] ?? vars['Téléphone'] ?? null,
      }
    }
    return { name: 'Chargement...', age: '', email: null, phone: null }
  }, [locationState, answers, questionMap])

  useEffect(() => {
    if (!submissionId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [answersData, qMap, gens] = await Promise.all([
          fetchSubmissionAnswers(submissionId!),
          fetchFormQuestionMap(),
          fetchGenerationsBySubmission(submissionId!),
        ])
        if (cancelled) return
        setAnswers(answersData)
        setQuestionMap(qMap)
        setGenerations(gens)
        if (gens.length > 0) {
          setSelectedGeneration(gens[0])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [submissionId])

  const handleGenerate = useCallback(async () => {
    if (!submissionId || generating) return
    setGenerating(true)
    setError(null)

    try {
      const template = await fetchDefaultTemplate()
      if (!template) {
        setError('Aucun template trouvé. Créez-en un dans la page Templates.')
        return
      }

      const variables = buildVariablesMap(answers, questionMap)
      if (candidateInfo.email) variables['Email'] = candidateInfo.email
      if (candidateInfo.phone) variables['Telephone'] = candidateInfo.phone

      const html = await generateLoverCv({
        answers: variables,
        templateHtml: template.html_content,
        customPrompt: customPrompt || undefined,
      })

      const session = getSession()
      const saved = await insertGeneration({
        submission_id: submissionId,
        html_content: html,
        custom_prompt: customPrompt || null,
        template_name: template.name,
        generated_by: session?.email ?? null,
      })

      setGenerations(prev => [saved, ...prev])
      setSelectedGeneration(saved)
      setCustomPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }, [submissionId, generating, answers, questionMap, candidateInfo, customPrompt])

  const handleDelete = useCallback(async (genId: string) => {
    try {
      await deleteGeneration(genId)
      setGenerations(prev => {
        const next = prev.filter(g => g.id !== genId)
        if (selectedGeneration?.id === genId) {
          setSelectedGeneration(next[0] ?? null)
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [selectedGeneration])

  const handleOpenNewTab = useCallback(() => {
    if (!selectedGeneration) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(selectedGeneration.html_content)
    w.document.close()
  }, [selectedGeneration])

  const handleDownload = useCallback(async () => {
    if (!selectedGeneration) return
    // Use an iframe so the full HTML document (head/style/body) renders correctly
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-9999px'
    // Start large so content renders at its natural width without wrapping
    iframe.style.width = '1920px'
    iframe.style.height = '5000px'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }
    doc.open()
    doc.write(selectedGeneration.html_content)
    doc.close()

    // Wait for iframe content (images, fonts, etc.) to fully load
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      setTimeout(resolve, 2000)
    })

    try {
      const body = doc.body
      body.style.margin = '0'
      body.style.padding = '0'
      body.style.background = 'white'
      // Remove any max-width constraints on the root element
      const root = doc.documentElement
      root.style.margin = '0'
      root.style.padding = '0'
      // Resize iframe to the actual content dimensions
      const contentW = Math.max(body.scrollWidth, root.scrollWidth)
      const contentH = Math.max(body.scrollHeight, root.scrollHeight)
      iframe.style.width = `${contentW}px`
      iframe.style.height = `${contentH}px`
      // Let layout recalculate after resize
      await new Promise((r) => requestAnimationFrame(r))

      const dataUrl = await toJpeg(body, {
        quality: 0.95,
        pixelRatio: 2,
        width: contentW,
        height: contentH,
        backgroundColor: '#ffffff',
      })
      const link = document.createElement('a')
      const name = candidateInfo.name !== 'Chargement...' ? candidateInfo.name : 'lover-cv'
      link.download = `lover-cv-${name.replace(/\s+/g, '-').toLowerCase()}.jpg`
      link.href = dataUrl
      link.click()
    } finally {
      document.body.removeChild(iframe)
    }
  }, [selectedGeneration, candidateInfo.name])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-4 py-3 lg:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/recherche')}
          className="gap-1.5"
        >
          <ArrowLeft className="size-4" />
          Retour
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div>
          <h1 className="text-lg font-semibold">
            {candidateInfo.name}{candidateInfo.age ? `, ${candidateInfo.age} ans` : ''}
          </h1>
          <p className="text-xs text-muted-foreground">Lover CV</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 lg:p-6">
        {/* Left panel */}
        <div className="flex w-[380px] flex-shrink-0 flex-col gap-4">
          {/* Generation form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" />
                Nouvelle génération
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Instructions personnalisées (optionnel)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Ex: Choisis une charte graphique chaleureuse, enrichis le profil avec des détails romantiques..."
                  rows={4}
                  disabled={generating || loading}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || loading}
                className="w-full gap-2"
              >
                {generating ? (
                  <>
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <FileText className="size-4" />
                    Générer
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* History */}
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" />
                Historique
                {generations.length > 0 && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {generations.length} génération{generations.length > 1 ? 's' : ''}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : generations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Aucune génération pour ce profil.
                </p>
              ) : (
                <ScrollArea className="h-full">
                  <div className="space-y-2 p-3">
                    {generations.map((gen) => (
                      <button
                        key={gen.id}
                        type="button"
                        onClick={() => setSelectedGeneration(gen)}
                        className={cn(
                          'w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                          selectedGeneration?.id === gen.id && 'border-primary bg-primary/5',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {formatDate(gen.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleDelete(gen.id)
                            }}
                            className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm">
                          {gen.custom_prompt || 'Aucun prompt personnalisé'}
                        </p>
                        {gen.generated_by && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            par {gen.generated_by}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel - Preview */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {selectedGeneration ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Aperçu — {formatDate(selectedGeneration.created_at)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownload}
                    className="gap-1.5"
                  >
                    <Download className="size-3.5" />
                    Télécharger
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenNewTab}
                    className="gap-1.5"
                  >
                    <ExternalLink className="size-3.5" />
                    Ouvrir dans un nouvel onglet
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-white">
                <iframe
                  title="Aperçu Lover CV"
                  srcDoc={selectedGeneration.html_content}
                  className="h-full w-full"
                  sandbox="allow-same-origin allow-scripts"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
              <div className="text-center">
                <FileText className="mx-auto size-12 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {loading
                    ? 'Chargement...'
                    : generations.length === 0
                      ? 'Générez votre premier Lover CV'
                      : 'Sélectionnez une génération'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
