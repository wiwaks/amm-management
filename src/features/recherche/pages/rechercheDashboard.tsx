import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { fetchFormResponses } from '../../../services/google/forms'
import type { UserSession } from '../../../shared/types'
import { Button } from '../../../shared/components/ui/button'
import { Badge } from '../../../shared/components/ui/badge'
import { Toast } from '../../../shared/components/ui/toast'
import { Logo } from '../../../shared/components/Logo'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'
//import { Form } from 'react-router-dom'

type ToastMessage = {
  title: string
  description?: string
  variant?: 'info' | 'success' | 'error'
}

type GoogleFormsResponse = {
  responseId?: string
  createTime?: string
  lastSubmittedTime?: string
  respondentEmail?: string
  name?: Record<
    string,
    {
      textAnswers?: {
        answers?: Array<{
          value?: string
        }>
      }
    }
  >
  answers?: Record<string, unknown>
}

type GoogleFormsPreview = {
  responses?: GoogleFormsResponse[]
  totalResponses?: number
}

interface DashboardProps {
  accessToken: string
  userSession: UserSession | null
  onLogout: () => void
}

// Navigation items for the sidebar and mobile nav
const NAV_ITEMS = [
  { label: 'Aperçu', active: false, route: null},
  { label: 'Import', active: true, route: '/dashboard' },
  { label: 'Historique', active: false, route: null },
  { label: 'Recherches', active: true, route: '/recherche' },
  { label: 'Clients', active: false, route: null},
  { label: 'Paramètres', active: false, route: null},
]



function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}
// Summarizes the answers object to get count and preview text i must have to take the name and the create at
function summarizeAnswers(answers?: Record<string, unknown>) {
  if (!answers) return { count: 0, preview: '—' }
  const entries = Object.values(answers)
  const values: string[] = []

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const textAnswers = record.textAnswers as
      | { answers?: Array<{ value?: string }> }
      | undefined
    const fileAnswers = record.fileUploadAnswers as
      | { answers?: Array<{ fileId?: string; fileName?: string }> }
      | undefined

    if (textAnswers?.answers?.length) {
      for (const answer of textAnswers.answers) {
        if (answer?.value) values.push(answer.value)
      }
    } else if (fileAnswers?.answers?.length) {
      for (const answer of fileAnswers.answers) {
        if (answer?.fileName || answer?.fileId) {
          values.push(answer.fileName || answer.fileId || '')
        }
      }
    }
  }

  const previewValues = values.filter(Boolean)
  const preview =
    previewValues.length === 0
      ? `${Object.keys(answers).length} champs`
      : previewValues.slice(0, 2).join(' • ')

  return {
    count: Object.keys(answers).length,
    preview,
  }
}

function RechercheDashboard({ accessToken, userSession, onLogout }: DashboardProps) {
    const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
    const [select1, setSelect1] = useState("");
    const [select2, setSelect2] = useState("");
    const [select3, setSelect3] = useState("");
    const [select4, setSelect4] = useState("");

  const [toast, setToast] = useState<ToastMessage | null>(null)

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      return fetchFormResponses(formId, accessToken)
    },
  })

  //bar de recherche beta
  const [searchTerm, setSearchTerm] = useState("");

 
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!previewMutation.isSuccess || !previewMutation.data) return
    const preview = previewMutation.data as GoogleFormsPreview
    const total = preview.totalResponses ?? preview.responses?.length ?? 0
    setToast({
      title: 'Prévisualisation chargée',
      description: `${total} réponses détectées.`,
      variant: 'info',
    })
  }, [previewMutation.isSuccess, previewMutation.data])

  useEffect(() => {
    if (previewMutation.isError && previewMutation.error) {
      setToast({
        title: 'Erreur de prévisualisation',
        description: previewMutation.error.message,
        variant: 'error',
      })
    }
  }, [previewMutation.isError, previewMutation.error])


  const previewData = previewMutation.data as GoogleFormsPreview | undefined
  const responses = previewData?.responses ?? []
  const totalResponses = previewData?.totalResponses ?? responses.length

  const sessionExpiry = userSession ? formatDate(userSession.expiresAt) : null
  // ---- UTILITAIRE POUR LIRE UNE RÉPONSE PAR QUESTION ID ----
const getAnswer = (answers: Record<string, any> | undefined, questionId: string) => {
  return answers?.[questionId]?.textAnswers?.answers?.[0]?.value ?? "";
};

// ---- UTILITAIRE POUR RÉCUPÉRER L’ÂGE (question 13f5679a) ----
const getAge = (answers: Record<string, any> | undefined) => {
  const val = getAnswer(answers, "13f5679a"); // TON ID âge
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
};

//fonction de bar de recherche beta
// ---- CHERCHE DANS TOUTES LES RÉPONSES ----
const matchesSearch = (
  answers: Record<string, any> | undefined,
  term: string
) => {
  if (!term) return true; // si champ vide → tout passe

  const lowerTerm = term.toLowerCase();

  if (!answers) return false;

  // On parcourt TOUTES les questions du formulaire
  for (const key of Object.keys(answers)) {
    const entry = answers[key];

    const textAnswers = entry?.textAnswers?.answers;
    if (Array.isArray(textAnswers)) {
      for (const a of textAnswers) {
        if (a?.value?.toLowerCase().includes(lowerTerm)) {
          return true;
        }
      }
    }
  }

  return false;
};
//-------------------------------------------------

// ---- VERSION FILTRÉE DE TON TABLEAU ----
const previewRows = useMemo(() => {
  return responses
    .filter((r: any) => {
      const answers = r.answers as Record<string, any>;

      // === EXEMPLES DE 3 FILTRES (tu peux changer les IDs plus tard) ===
      const sexe = getAnswer(answers, "0ee9528d");      // Une femme / Un homme
      const voulEnfant = getAnswer(answers, "4a93faa4");     // oui / non / ça se discute
      const age = getAge(answers);                      // nombre
      const pratiquant = getAnswer(answers, "32cdfe5a"); // oui / non

      // ---- FILTRE 1 : sexe ----
      const okSexe =
        !select1 || sexe.includes(select1);

      // ---- FILTRE 2 : Vouloir des enfant ----
      const okvoulEnfant =
        !select2 || voulEnfant.includes(select2);

      // ---- FILTRE 3 : TRANCHES D’ÂGE ----
      let okAge = true;
      if (select3 && age !== null) {
        if (select3 === "18-25") okAge = age >= 18 && age <= 25;
        if (select3 === "26-35") okAge = age >= 26 && age <= 35;
        if (select3 === "36-50") okAge = age >= 36 && age <= 50;
        if (select3 === "50+") okAge = age > 50;
      }

      // ---- FILTRE 4 : Pratiquant ----
        const okPratiquant =
        !select4 || pratiquant.includes(select4);

      // ---- FILTRE 5 : BARRE DE RECHERCHE ----
        const okSearch = matchesSearch(answers, searchTerm);


      return okSexe && okvoulEnfant && okAge && okPratiquant && okSearch;
    })
}, [responses, select1, select2, select3, select4]);
onload=() => previewMutation.mutate()
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-10">
        <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] w-72 flex-col lg:flex">
          <div className="flex h-full flex-col gap-6 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm">
            <div className="space-y-3">
              <Logo subtitle="Back office" />
              <p className="text-sm text-muted-foreground">
                Visualizez toute les réponses au formulaire.
              </p>
            </div>

            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.route || undefined}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    item.active
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/40'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.active ? (
                    <span className="text-xs uppercase tracking-[0.3em] text-primary">
                      actif
                    </span>
                  ) : null}
                </a>
              ))}
            </nav>

            <div className="mt-auto space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Support
              </p>
              <p className="text-muted-foreground">
                Besoin d’aide sur comment filtré vos réponses ?
              </p>
              <Button variant="secondary" size="sm" className="w-full">
                Contacter l’équipe
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 lg:hidden">
                <Logo subtitle="Back office" />
              </div>
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                Rubrique Recherche
              </p>
              <h1 className="font-display text-3xl font-semibold md:text-4xl">
                Filtrez et analysez les réponses
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Filtrez les réponses de votre formulaire Google Forms selon
                différents critères pour mieux analyser vos données.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">
                Session {userSession?.sessionId.slice(0, 8) ?? '—'}
              </Badge>
              {sessionExpiry ? (
                <Badge variant="warning">Expire {sessionExpiry}</Badge>
              ) : null}
              <Button variant="outline" size="sm" onClick={onLogout}>
                Se déconnecter
              </Button>
            </div>
          </header>

          <div className="flex gap-2 overflow-auto pb-2 lg:hidden">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.route || undefined}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] ${
                  item.active
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/60 bg-card/70">
              <CardHeader>
                <CardTitle className="text-base">Formulaire</CardTitle>
                <CardDescription>ID Google Forms</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="truncate">
                  {formId ? (
                    <span className="text-foreground">{formId}</span>
                  ) : (
                    'Non configuré'
                  )}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/70">
              <CardHeader>
                <CardTitle className="text-base">Statut</CardTitle>
                <CardDescription>Authentification</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge variant={accessToken ? 'success' : 'outline'}>
                  {accessToken ? 'Connecté' : 'Non connecté'}
                </Badge>
                <span className="text-xs text-muted-foreground">Token actif</span>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>Visualisation des réponses</CardTitle>
                  <CardDescription>
                    Tableau des réponses Google Forms.
                  </CardDescription>
                </div>
                <Badge variant={previewMutation.isSuccess ? 'success' : 'outline'}>
                  {previewMutation.isSuccess
                    ? `${totalResponses} réponses`
                    : 'En attente'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 items-center">
                <div className="flex flex-wrap gap-3">
                    <div className="flex flex-wrap gap-3 items-center">
                        <div>
                            <h5>Le sexe</h5>
                            <select
                                className="border rounded px-2 py-1"
                                value={select1}
                                onChange={e => setSelect1(e.target.value)}
                                title='Filtre1'
                            >
                                <option value=""> - </option>
                                <option value="Un homme">Un homme</option>
                                <option value="Une femme">Une femme</option>
                            </select>
                        </div>

                        <div>
                            <h5>Veut des enfants</h5>
                            <select
                                className="border rounded px-2 py-1"
                                value={select2}
                                onChange={e => setSelect2(e.target.value)}
                                title='Filtre2'
                            >
                                <option value=""> - </option>
                                <option value="Oui">Oui</option>
                                <option value="Non">Non</option>
                                <option value="Ça se discute">Ça se discute</option>
                            </select>
                        </div>

                        <div>
                            <h5>Tranche d'âge</h5>
                            <select
                                className="border rounded px-2 py-1"
                                value={select3}
                                onChange={e => setSelect3(e.target.value)}
                                title='Filtre3'
                            >
                                <option value=""> - </option>
                                <option value="18-25">18-25</option>
                                <option value="26-35">26-35</option>
                                <option value="36-50">36-50</option>
                                <option value="50+">50+</option>
                            </select>
                        </div>

                        <div>
                            <h5>Pratiquant</h5>
                            <select
                                className="border rounded px-2 py-1"
                                value={select4}
                                onChange={e => setSelect4(e.target.value)}
                                title='Filtre4'
                            >
                                <option value=""> - </option>
                                <option value="Pratiquant">Pratiquant</option>
                                <option value="Non pratiquant">Non Pratiquant</option>
                            </select>
                        </div>
                        </div>
                
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => previewMutation.mutate()}
                    disabled={previewMutation.isPending}
                  >
                    Rafraîchir
                  </Button>
                </div>

                <div className="w-full mb-4 flex flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Rechercher dans toutes les réponses..."
                    className="w-full border rounded px-3 py-2"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    title='Recherche'
                    disabled={previewMutation.isPending}
                    maxLength={100}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => previewMutation.mutate()}
                    disabled={previewMutation.isPending}
                  >
                    Valider
                  </Button>
                </div>
                  <p className="text-xs text-muted-foreground">Pour rechercher, vous devez valider la recherche après avoir entré un terme de recherche. Si vous ne souhaitez pas effectuer de recherche, laissez le champ vide et valider.</p>


                <div className="rounded-2xl border border-border/60 bg-muted/20">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Response ID</TableHead>
                        <TableHead>Soumis</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Prenom</TableHead>
                        <TableHead>Numéro de teléphone</TableHead>
                        <TableHead>mail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-muted-foreground"
                          >
                            Aucune réponse à afficher pour le moment.
                          </TableCell>
                        </TableRow>
                      ) : (
                        previewRows.map((response) => {
                          const summary = summarizeAnswers(response.answers)
                          return (
                            <TableRow key={response.responseId}>
                              <TableCell className="font-medium">
                                {response.responseId?.slice(0, 12) || '—'}
                              </TableCell>
                              <TableCell>
                                {formatDate(
                                  response.lastSubmittedTime ||
                                    response.createTime,
                                )}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const entry = (response.answers as Record<string, any>)?.['778b574a']
                                  const vals = entry?.textAnswers?.answers?.map((a: any) => a.value).filter(Boolean)
                                  return vals
                                })()}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const entry = (response.answers as Record<string, any>)?.['184c859f']
                                  const vals = entry?.textAnswers?.answers?.map((a: any) => a.value).filter(Boolean)
                                  return vals
                                })()}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const entry = (response.answers as Record<string, any>)?.['458e9ec2']
                                  const vals = entry?.textAnswers?.answers?.map((a: any) => a.value).filter(Boolean)
                                  return vals
                                })()}
                              </TableCell>
                              <TableCell>
                                {response.respondentEmail || '—'}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                <details className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
                  <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Voir le JSON brut
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto text-xs leading-relaxed">
                    {previewMutation.data
                      ? JSON.stringify(previewMutation.data, null, 2)
                      : 'Aucune réponse chargée.'}
                  </pre>
                </details>
              </CardContent>
            </Card>

            <div className="space-y-6">
                <Card className="border-border/60 bg-card/80">
                    <CardHeader>
                    <CardTitle className="text-base">Derniers repères</CardTitle>
                    <CardDescription>
                        Notes internes pour l’équipe.
                    </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>• Vérifier le mapping des champs avant l’import.</p>
                    <p>• Contrôler les doublons sur la table Supabase.</p>
                    <p>• Mettre à jour le formulaire si besoin.</p>
                    </CardContent>
                </Card>
            </div>
          </div>
        </main>
      </div>

      {toast ? (
        <div className="fixed right-6 top-6 z-50 flex w-full max-w-sm flex-col gap-3">
          <Toast
            title={toast.title}
            description={toast.description}
            variant={toast.variant}
            onClose={() => setToast(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

export default RechercheDashboard
