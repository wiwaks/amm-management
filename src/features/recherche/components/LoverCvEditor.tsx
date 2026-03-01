import { useEffect, useRef, useCallback, useState } from 'react'
import grapesjs, { type Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import { Save, X } from 'lucide-react'
import { Button } from '../../../shared/components/ui/button'
import { uploadLoverCvImage } from '../../../services/supabase/loverCvStorage'

type Props = {
  htmlContent: string
  submissionId: string
  onSave: (html: string) => void
  onCancel: () => void
}

type Tab = 'blocks' | 'styles' | 'layers'

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Nunito:wght@300;400;600;700;800&family=Dancing+Script:wght@500;700&display=swap'

function parseHtml(fullHtml: string) {
  const styleMatch = fullHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  const css = styleMatch?.[1] ?? ''
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const body = bodyMatch?.[1] ?? fullHtml
  const headMatch = fullHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  const headContent = headMatch?.[1] ?? ''
  return { css, body, headContent }
}

function rebuildHtml(html: string, css: string, originalHeadContent: string) {
  const cleanHead = originalHeadContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim()
  return `<!DOCTYPE html>
<html lang="fr">
<head>
${cleanHead}
<style>
${css}
</style>
</head>
<body>
${html}
</body>
</html>`
}

export default function LoverCvEditor({ htmlContent, submissionId, onSave, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const parsedRef = useRef(parseHtml(htmlContent))
  const [activeTab, setActiveTab] = useState<Tab>('blocks')

  useEffect(() => {
    if (!containerRef.current) return

    const { css, body } = parsedRef.current

    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      storageManager: false,
      width: '100%',
      height: '100%',
      canvas: {
        styles: [GOOGLE_FONTS_URL],
      },
      deviceManager: { devices: [] },
      panels: { defaults: [] },
      assetManager: {
        async uploadFile(e) {
          const files = (e as DragEvent).dataTransfer
            ? Array.from((e as DragEvent).dataTransfer!.files)
            : Array.from((e.target as HTMLInputElement).files ?? [])

          for (const file of files) {
            try {
              const url = await uploadLoverCvImage(file, submissionId)
              editor.AssetManager.add({ type: 'image', src: url, name: file.name })
              const selected = editor.getSelected()
              if (selected?.is('image')) {
                selected.addAttributes({ src: url })
                editor.AssetManager.close()
              }
            } catch (err) {
              console.error('Upload failed:', err)
            }
          }
        },
      },
      blockManager: {
        appendTo: '#gjs-blocks',
        blocks: [
          {
            id: 'image',
            label: 'Image',
            media: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
            content: { type: 'image' },
          },
          {
            id: 'text',
            label: 'Texte',
            media: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M2 4v3h5v12h3V7h5V4H2zm19 5h-9v3h3v7h3v-7h3V9z"/></svg>',
            content: '<div data-gjs-type="text">Texte ici</div>',
          },
          {
            id: 'div',
            label: 'Bloc',
            media: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/></svg>',
            content: '<div style="padding:10px;min-height:50px;"></div>',
          },
        ],
      },
      layerManager: {
        appendTo: '#gjs-layers',
      },
      selectorManager: {
        appendTo: '#gjs-styles',
      },
      styleManager: {
        appendTo: '#gjs-styles',
        sectors: [
          {
            name: 'Typographie',
            open: true,
            properties: [
              { property: 'font-size', type: 'number', units: ['px', 'rem', 'em'] },
              { property: 'color', type: 'color' },
              { property: 'font-weight', type: 'select', options: [
                { id: '300', label: 'Light' },
                { id: '400', label: 'Normal' },
                { id: '600', label: 'Semi-Bold' },
                { id: '700', label: 'Bold' },
                { id: '800', label: 'Extra-Bold' },
              ]},
              { property: 'text-align', type: 'radio', options: [
                { id: 'left', label: 'Gauche' },
                { id: 'center', label: 'Centre' },
                { id: 'right', label: 'Droite' },
                { id: 'justify', label: 'Justifié' },
              ]},
              { property: 'line-height', type: 'number', units: ['', 'px'] },
            ],
          },
          {
            name: 'Fond & Bordures',
            open: false,
            properties: [
              { property: 'background-color', type: 'color' },
              { property: 'border-radius', type: 'number', units: ['px', '%'] },
              { property: 'border-color', type: 'color' },
            ],
          },
          {
            name: 'Dimensions',
            open: false,
            properties: [
              { property: 'width', type: 'number', units: ['px', '%', 'em'] },
              { property: 'height', type: 'number', units: ['px', '%', 'em'] },
              { property: 'object-fit', type: 'select', options: [
                { id: 'cover', label: 'Cover' },
                { id: 'contain', label: 'Contain' },
                { id: 'fill', label: 'Fill' },
                { id: 'none', label: 'None' },
              ]},
            ],
          },
          {
            name: 'Espacement',
            open: false,
            properties: [
              { property: 'padding', type: 'composite', properties: [
                { property: 'padding-top', type: 'number', units: ['px'] },
                { property: 'padding-right', type: 'number', units: ['px'] },
                { property: 'padding-bottom', type: 'number', units: ['px'] },
                { property: 'padding-left', type: 'number', units: ['px'] },
              ]},
              { property: 'margin', type: 'composite', properties: [
                { property: 'margin-top', type: 'number', units: ['px'] },
                { property: 'margin-right', type: 'number', units: ['px'] },
                { property: 'margin-bottom', type: 'number', units: ['px'] },
                { property: 'margin-left', type: 'number', units: ['px'] },
              ]},
            ],
          },
        ],
      },
    })

    // Load content
    editor.setComponents(body)
    editor.setStyle(css)

    editorRef.current = editor

    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [submissionId])

  const handleSave = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const html = editor.getHtml()
    const css = editor.getCss() ?? ''
    const fullHtml = rebuildHtml(html, css, parsedRef.current.headContent)
    onSave(fullHtml)
  }, [onSave])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <span className="text-sm font-medium">Mode édition visuelle</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5">
            <X className="size-3.5" />
            Annuler
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="size-3.5" />
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* Editor row: canvas + right sidebar */}
      <div className="gjs-editor-row flex min-h-0 flex-1">
        {/* GrapesJS canvas */}
        <div ref={containerRef} className="min-h-0 flex-1" />

        {/* Right sidebar - fully controlled by React */}
        <div className="gjs-panel-right">
          <div className="gjs-tab-switcher">
            <button
              type="button"
              className={activeTab === 'blocks' ? 'active' : ''}
              onClick={() => setActiveTab('blocks')}
            >
              Blocs
            </button>
            <button
              type="button"
              className={activeTab === 'styles' ? 'active' : ''}
              onClick={() => setActiveTab('styles')}
            >
              Styles
            </button>
            <button
              type="button"
              className={activeTab === 'layers' ? 'active' : ''}
              onClick={() => setActiveTab('layers')}
            >
              Calques
            </button>
          </div>
          <div id="gjs-blocks" style={{ display: activeTab === 'blocks' ? '' : 'none' }} />
          <div id="gjs-styles" style={{ display: activeTab === 'styles' ? '' : 'none' }} />
          <div id="gjs-layers" style={{ display: activeTab === 'layers' ? '' : 'none' }} />
        </div>
      </div>
    </div>
  )
}
